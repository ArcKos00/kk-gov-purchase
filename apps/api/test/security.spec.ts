import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { BASELINE, checkManifestSecurity } from '@k2/security';
import { NO_STORE_HEADERS, SECURITY_HEADERS } from '@k2/security/server';
import { config } from '../src/config';
import { LoggerModule } from '../src/logging/logger.module';
import { setupApp } from '../src/setup';
import type { SessionUser } from '../src/auth/session';
import {
  clientIp, MANIFEST_SECURITY, MAX_EVENTS_BODY_BYTES, SECURITY_APP, securityPolicyFor, securityStartupEvents,
} from '../src/security/security';
import { SecurityModule } from '../src/security/security.module';

const ivan: SessionUser = { id: 'sub-1', username: 'ipetrenko', displayName: 'Іван Петренко' };

describe('безпековий шаблон К-2: маніфест і політика', () => {
  it('розділ security валідний і на поточній версії шаблону, відступів немає', () => {
    expect(checkManifestSecurity(MANIFEST_SECURITY)).toEqual([]);
    expect(MANIFEST_SECURITY.baseline).toBe(BASELINE);
    expect(MANIFEST_SECURITY.deviations).toEqual([]);
  });

  it('без людини — усе ввімкнено, знак з назвою застосунку', () => {
    expect(securityPolicyFor(null, { env: {} })).toEqual({
      baseline: BASELINE,
      app: SECURITY_APP,
      who: null,
      controls: { watermark: true, print: true },
      exemptions: [],
    });
  });

  it('людина на знаку — «Ім\'я (логін)»; без імені — логін', () => {
    expect(securityPolicyFor(ivan, { env: {} }).who).toBe('Іван Петренко (ipetrenko)');
    expect(securityPolicyFor({ ...ivan, displayName: null }, { env: {} }).who).toBe('ipetrenko');
  });

  it('винятків людини немає ніколи: вхід напряму в Keycloak, claim k2_sec не доходить — друк заборонено', () => {
    const p = securityPolicyFor({ ...ivan, admin: true }, { env: {} });
    expect(p.controls).toEqual({ watermark: true, print: true });
    expect(p.exemptions).toEqual([]);
  });

  it('source.ip — IPv4 без ::ffff:, сміття — без адреси', () => {
    expect(clientIp('::ffff:10.20.50.7')).toBe('10.20.50.7');
    expect(clientIp('2001:DB8::1')).toBe('2001:db8::1');
    expect(clientIp('not-an-ip')).toBeUndefined();
    expect(clientIp(undefined)).toBeUndefined();
  });

  it('перемикачі середовища K2_SECURITY_* — понад усе і з подією config_override на старті', () => {
    const env = { K2_SECURITY_PRINT: 'off', K2_SECURITY_WATERMARK: 'banana', ELASTIC_APM_ENVIRONMENT: 'gov' };
    expect(securityPolicyFor(ivan, { env }).controls).toEqual({ watermark: true, print: false });
    const events = securityStartupEvents(env);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: { action: 'k2.security.config_override', category: ['configuration'], type: ['change'], dataset: 'k2.security' },
      service: { name: SECURITY_APP, environment: 'gov' },
      k2: { security: { baseline: BASELINE, control: 'print' } },
    });
    expect(securityStartupEvents({})).toEqual([]);
  });
});

/** Підставна сесія: заголовок x-test-user — людина увійшла (як express-session з PgSessionStore). */
function fakeSession(req: Request, _res: Response, next: NextFunction) {
  if (req.headers['x-test-user'])
    Object.assign(req, { session: { user: ivan, expiresAt: Date.now() + 3_600_000 } });
  next();
}

@Module({ imports: [LoggerModule, SecurityModule] })
class TestSecurityModule {}

describe('безпековий шаблон К-2: маршрути /k2-security/* і заголовки', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const authDisabled = config.authDisabled;
  let stdout: jest.SpyInstance;
  let lines: string[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestSecurityModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(fakeSession);
    setupApp(app); // AUTH_DISABLED=true з setup-env: без справжньої сесії і БД
    await app.init();
    // далі — як у проді: людина лише з сесії
    config.authDisabled = false;
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    config.authDisabled = authDisabled;
    await app.close();
  });

  beforeEach(() => {
    lines = [];
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });
  });
  afterEach(() => stdout.mockRestore());

  /** Рядки подій безпеки — саме ті, що Filebeat забирає з stdout. */
  const securityLines = () => lines.filter((l) => l.includes('"k2.security"'));

  const expectTemplateHeaders = (res: request.Response) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers[k]).toBe(v);
    expect(res.headers['permissions-policy']).toContain('display-capture=()');
  };

  it('GET /k2-security/policy без входу — усе ввімкнено, без кешу', async () => {
    const res = await http.get('/k2-security/policy').expect(200);
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    for (const [k, v] of Object.entries(NO_STORE_HEADERS)) expect(res.headers[k]).toBe(v);
    expect(res.body).toEqual({
      baseline: BASELINE, app: SECURITY_APP, who: null, controls: { watermark: true, print: true }, exemptions: [],
    });
    expectTemplateHeaders(res);
  });

  it('GET /k2-security/policy з сесією — людина на знаку', async () => {
    const res = await http.get('/k2-security/policy').set('x-test-user', '1').expect(200);
    expect(res.body.who).toBe('Іван Петренко (ipetrenko)');
    expect(res.body.controls).toEqual({ watermark: true, print: true });
  });

  it('маршрути — без префікса /api', async () => {
    await http.get('/api/k2-security/policy').expect(404);
  });

  it('заголовки шаблону — на всі відповіді, і на помилки', async () => {
    expectTemplateHeaders(await http.get('/api/nope').expect(404));
    expectTemplateHeaders(await http.post('/k2-security/events').send({ events: [] }).expect(401));
  });

  it('POST /k2-security/events: 403 з іншого сайту', async () => {
    await http.post('/k2-security/events').set('x-test-user', '1').set('sec-fetch-site', 'cross-site')
      .send({ events: [{ action: 'print_attempt' }] }).expect(403);
    await http.post('/k2-security/events').set('x-test-user', '1').set('origin', 'https://evil.example')
      .send({ events: [{ action: 'print_attempt' }] }).expect(403);
    expect(securityLines()).toEqual([]);
  });

  it('POST /k2-security/events: 401 без сесії (анонімний перегляд теж)', async () => {
    const res = await http.post('/k2-security/events').set('sec-fetch-site', 'same-origin')
      .send({ events: [{ action: 'print_attempt' }] }).expect(401);
    expect(res.headers['cache-control']).toBe('no-store, private');
    expect(securityLines()).toEqual([]);
  });

  it('POST /k2-security/events: 413 тіло понад 64 КБ', async () => {
    const big = JSON.stringify({ events: [{ action: 'print_attempt', path: '/' + 'x'.repeat(MAX_EVENTS_BODY_BYTES) }] });
    await http.post('/k2-security/events').set('x-test-user', '1').set('content-type', 'application/json').send(big)
      .expect(413);
    expect(securityLines()).toEqual([]);
  });

  it('POST /k2-security/events: 413 і для потокового тіла без content-length', async () => {
    const server: Server = app.getHttpServer();
    if (!server.listening) await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { port, host: '127.0.0.1', method: 'POST', path: '/k2-security/events',
          headers: { 'x-test-user': '1', 'content-type': 'application/json', 'transfer-encoding': 'chunked' } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.write('{"events": [{"action": "print_attempt", "path": "/');
      for (let i = 0; i < 20; i++) req.write('x'.repeat(4096));
      req.end('"}]}');
    });
    expect(status).toBe(413);
    expect(securityLines()).toEqual([]);
  });

  it('POST /k2-security/events: 400 не JSON', async () => {
    await http.post('/k2-security/events').set('x-test-user', '1').set('content-type', 'application/json')
      .send('{"events": [').expect(400);
    await http.post('/k2-security/events').set('x-test-user', '1').set('content-type', 'text/plain').send('')
      .expect(400);
  });

  it('POST /k2-security/events: 204 і по рядку ECS JSON у stdout на подію', async () => {
    await http.post('/k2-security/events')
      .set('x-test-user', '1').set('sec-fetch-site', 'same-origin').set('user-agent', 'test-agent')
      .send({
        events: [
          { action: 'print_attempt', control: 'print', path: '/contracts/5', at: '2026-11-17T10:00:00.000Z' },
          { action: 'rm -rf', control: 'print' },
          { action: 'watermark_tampered', control: 'watermark' },
        ],
      })
      .expect(204);
    const out = securityLines();
    expect(out).toHaveLength(2);
    for (const l of out) {
      // рядок від @k2/security як є: не обгорнутий логером застосунку, один рядок
      expect(l.startsWith('{"@timestamp"')).toBe(true);
      expect(l.endsWith('\n')).toBe(true);
      expect(l.trimEnd()).not.toContain('\n');
    }
    const [print, tampered] = out.map((l) => JSON.parse(l));
    expect(print).toMatchObject({
      'ecs.version': '8.11.0',
      event: { action: 'k2.security.print_attempt', outcome: 'failure', dataset: 'k2.security' },
      service: { name: SECURITY_APP },
      user: { name: 'ipetrenko' },
      source: { ip: '127.0.0.1' },
      user_agent: { original: 'test-agent' },
      url: { path: '/contracts/5' },
      k2: { security: { baseline: BASELINE, control: 'print', client_at: '2026-11-17T10:00:00.000Z' } },
    });
    expect(tampered.event.action).toBe('k2.security.watermark_tampered');
  });

  it('POST /k2-security/events: невідомі дії й сміття — 204 без подій, не більше 20 за запит', async () => {
    await http.post('/k2-security/events').set('x-test-user', '1').send({ events: 'nope' }).expect(204);
    await http.post('/k2-security/events').set('x-test-user', '1').send([1, 2]).expect(204);
    expect(securityLines()).toEqual([]);
    await http.post('/k2-security/events').set('x-test-user', '1')
      .send({ events: Array.from({ length: 30 }, () => ({ action: 'policy_unavailable' })) }).expect(204);
    expect(securityLines()).toHaveLength(20);
  });
});
