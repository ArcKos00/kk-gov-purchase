import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { config } from '../src/config';
import { setupApp } from '../src/setup';

const SELF = 'https://purchase.gov.kub.k2.lan';
const DOCS = 'https://api-docs.kub.k2.lan';
const EVIL = 'https://evil.kub.k2.lan';

const contract = {
  number: 'Д-7/2026',
  counterparty: 'ТОВ "Постачальник"',
  contractDate: '2026-09-01',
  expectedDeliveryDate: '2099-10-20',
  notes: null,
  items: [{ name: 'Болт М8', unit: 'шт', quantity: 10 }],
};

/** CSRF (1.4.0, security/origin-check.ts): запис лише з Origin сервісу, документації (лише /api) чи same-origin. */
describe('Перевірка Origin на запис', () => {
  const { apiDocsOrigin, publicUrl } = config;
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const ds = await new DataSource({ type: 'postgres', url: config.databaseUrl }).initialize();
    await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ds.destroy();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  beforeEach(() => {
    config.publicUrl = SELF;
    config.apiDocsOrigin = DOCS;
  });

  afterAll(async () => {
    config.publicUrl = publicUrl;
    config.apiDocsOrigin = apiDocsOrigin;
    await app.close();
  });

  // номер договору унікальний — кожен успішний запис створює новий
  let seq = 0;
  const create = (origin?: string) => {
    const r = http.post('/api/contracts');
    return origin ? r.set('Origin', origin) : r;
  };
  const fresh = () => ({ ...contract, number: `Д-7/${++seq}` });

  const expectCrossSite = (res: request.Response) => {
    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ statusCode: 403, code: 'cross_site' });
    expect(res.body.message).toMatch(/з іншого сайту/);
    expect(res.headers['cache-control']).toBe('no-store');
  };

  it('запис зі свого origin — ок (так ходить фронт)', async () => {
    const res = await create(SELF).send(fresh()).expect(201);
    expect(res.body.id).toBeDefined();
  });

  it('запис із сусіднього сайту — 403 з JSON українською, і нічого не змінено', async () => {
    const before = (await http.get('/api/contracts').expect(200)).body.total;
    expectCrossSite(await create(EVIL).send(contract));
    // форма й multipart (без preflight) — так само
    expectCrossSite(await create(EVIL).type('form').send('number=x'));
    expectCrossSite(await create(EVIL).field('number', 'x'));
    expect((await http.get('/api/contracts').expect(200)).body.total).toBe(before);
  });

  it('PUT / PATCH / DELETE з чужого origin — 403, договір цілий', async () => {
    const { id } = (await create(SELF).send(fresh()).expect(201)).body;
    expectCrossSite(await http.put(`/api/contracts/${id}`).set('Origin', EVIL).send(contract));
    expectCrossSite(await http.put(`/api/contracts/${id}/file`).set('Origin', EVIL).attach('file', Buffer.from('x'), 'a.pdf'));
    expectCrossSite(await http.patch(`/api/contracts/${id}`).set('Origin', EVIL).send({}));
    expectCrossSite(await http.delete(`/api/contracts/${id}`).set('Origin', EVIL));
    await http.get(`/api/contracts/${id}`).expect(200);
  });

  it('схожі origin — теж чужі: null, інша схема, хвіст домену, порт, регістр шляху', async () => {
    for (const origin of ['null', 'http://purchase.gov.kub.k2.lan', `${SELF}.evil.example`, `${SELF}:8443`, `${SELF}/`]) {
      expectCrossSite(await create(origin).send(contract));
    }
    expectCrossSite(await http.post('/API/contracts').set('Origin', EVIL).send(contract));
    expectCrossSite(await http.post('//api/contracts').set('Origin', EVIL).send(contract));
  });

  it('«Документація API»: на /api/* — ок, на /auth/* (не вхід) — 403', async () => {
    await create(DOCS).send(fresh()).expect(201);
    expectCrossSite(await http.post('/auth/logout').set('Origin', DOCS));
  });

  it('без API_DOCS_ORIGIN — документація як будь-який чужий origin', async () => {
    config.apiDocsOrigin = null;
    expectCrossSite(await create(DOCS).send(contract));
  });

  it('без Origin: Sec-Fetch-Site same-origin — ок, same-site / cross-site / none — 403', async () => {
    await create().set('Sec-Fetch-Site', 'same-origin').send(fresh()).expect(201);
    for (const site of ['same-site', 'cross-site', 'none']) {
      expectCrossSite(await create().set('Sec-Fetch-Site', site).send(contract));
    }
  });

  it('без Origin і Sec-Fetch-Site (не браузер, сервер-сервер) — пропускаємо, як Бастіон', async () => {
    await create().send(fresh()).expect(201);
    await http.post('/auth/logout').expect(201);
  });

  it('Origin важливіший за Sec-Fetch-Site', async () => {
    expectCrossSite(await create(EVIL).set('Sec-Fetch-Site', 'same-origin').send(contract));
  });

  it('GET і HEAD — без змін, з будь-яким origin', async () => {
    await http.get('/api/contracts').set('Origin', EVIL).set('Sec-Fetch-Site', 'cross-site').expect(200);
    await http.head('/api/contracts').set('Origin', EVIL).expect(200);
    await http.get('/auth/me').set('Origin', EVIL).expect(200);
    await http.get('/auth/login').set('Origin', EVIL).expect(302);
  });

  it('кроки входу (/auth/login, /auth/callback) — без перевірки Origin (перехід від Keycloak)', async () => {
    for (const path of ['/auth/login', '/auth/callback']) {
      const res = await http.post(path).set('Origin', 'https://auth.infrastructure.kub.k2.lan').type('form').send('code=x');
      expect(res.status).not.toBe(403);
    }
  });

  it('вихід зі свого origin — ок', async () => {
    await http.post('/auth/logout').set('Origin', SELF).expect(201);
  });

  it('/k2-security/events — своя брама (security.ts), ця не заважає своєму сайту', async () => {
    await http.post('/k2-security/events').set('Origin', SELF).set('Sec-Fetch-Site', 'same-origin')
      .send({ events: [] }).expect(204);
  });
});
