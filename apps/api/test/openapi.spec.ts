import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup';
import { config } from '../src/config';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Doc = {
  openapi: string;
  servers: { url: string }[];
  paths: Record<string, Partial<Record<(typeof METHODS)[number], { summary?: string; tags?: string[] }>>>;
};

/** Опис API (GET /api/openapi.json): без входу, з усіма маршрутами; решта API — як і раніше лише після входу. */
describe('опис OpenAPI', () => {
  const web = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dist-'));
  const { webDist, authDisabled, anonymousRead } = config;
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const ds = await new DataSource({ type: 'postgres', url: config.databaseUrl }).initialize();
    await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ds.destroy();
    // зібраний фронт: SPA-фолбек не має перехопити маршрут опису
    fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><div id="root"></div>');
    config.webDist = web;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    http = request(app.getHttpServer());
    // далі — як на проді: без сесії людина не ввійшла
    config.authDisabled = false;
  });

  afterAll(async () => {
    Object.assign(config, { webDist, authDisabled, anonymousRead });
    await app.close();
    fs.rmSync(web, { recursive: true, force: true });
    fs.rmSync(config.uploadsDir, { recursive: true, force: true });
  });

  it('віддає OpenAPI 3.x без входу, JSON, без кешу', async () => {
    const res = await http.get('/api/openapi.json').expect(200).expect('Content-Type', /application\/json/);
    expect(res.headers['cache-control']).toBe('no-store');
    const doc: Doc = res.body;
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.servers).toEqual([{ url: '/' }]);
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/api/contracts', '/api/contracts/{id}', '/api/deliveries', '/api/pool']));
  });

  it('без входу і без анонімного перегляду: опис — 200, дані й зміни — 401', async () => {
    config.anonymousRead = false;
    try {
      await http.get('/api/openapi.json').expect(200);
      await http.get('/api/contracts').expect(401);
      await http.get('/api/audit').expect(401);
      await http.post('/api/contracts').send({}).expect(401);
    } finally {
      config.anonymousRead = anonymousRead;
    }
  });

  it('з анонімним переглядом зміни й журнал — як і раніше лише після входу', async () => {
    config.anonymousRead = true;
    await http.get('/api/contracts').expect(200);
    await http.post('/api/pool').send({}).expect(401);
    await http.get('/api/audit').expect(401);
  });

  it('Swagger UI не відкрито', async () => {
    for (const url of ['/api/docs', '/api', '/api/openapi', '/api/openapi.yaml']) await http.get(url).expect(404);
  });

  it('кожен маршрут API описано (українською), крім переходів входу', async () => {
    const doc: Doc = (await http.get('/api/openapi.json').expect(200)).body;
    const described = new Set<string>();
    for (const [p, ops] of Object.entries(doc.paths))
      for (const m of METHODS) {
        const op = ops[m];
        if (!op) continue;
        described.add(`${m.toUpperCase()} ${p.replace(/\{(\w+)\}/g, ':$1')}`);
        expect([p, m, op.summary]).toEqual([p, m, expect.stringMatching(/[А-ЯҐЄІЇа-яґєії]/)]);
        expect(op.tags?.length).toBeGreaterThan(0);
      }

    // маршрути Nest у самому Express: усе, що застосунок справді обслуговує
    const stack = (app.getHttpAdapter().getInstance() as { router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } })
      .router.stack;
    // `{*path}`, `{/*splat}` — службові шаблони Express (винятки глобального префікса), не маршрути
    const served = stack
      .filter((l) => l.route && !/\{\/?\*/.test(l.route.path))
      .flatMap((l) => Object.keys(l.route!.methods).filter((m) => m !== '_all').map((m) => `${m.toUpperCase()} ${l.route!.path}`));
    expect(served).toEqual(expect.arrayContaining(['GET /api/contracts', 'POST /api/contracts/:id/deliveries', 'GET /auth/me']));
    const notDescribed = served.filter(
      (r) => !described.has(r) && !['GET /api/openapi.json', 'GET /auth/login', 'GET /auth/callback'].includes(r),
    );
    expect(notDescribed).toEqual([]);
  });
});
