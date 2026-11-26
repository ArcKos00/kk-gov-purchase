import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { config, parseOrigin } from '../src/config';
import { setupApp } from '../src/setup';

const DOCS = 'https://api-docs.kub.k2.lan';
const EVIL = 'https://evil.kub.k2.lan';

const contract = {
  number: 'Д-1/2026',
  counterparty: 'ТОВ "Постачальник"',
  contractDate: '2026-09-01',
  expectedDeliveryDate: '2099-10-20',
  notes: null,
  items: [{ name: 'Болт М8', unit: 'шт', quantity: 10 }],
};

/** CORS для «Документації API» (1.3.0, security/api-docs-cors.ts): рівно API_DOCS_ORIGIN, з кукі; інші — нічого. */
describe('CORS для «Документації API»', () => {
  const { apiDocsOrigin } = config;
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
    config.apiDocsOrigin = DOCS;
  });

  afterAll(async () => {
    config.apiDocsOrigin = apiDocsOrigin;
    await app.close();
  });

  it('preflight від документації: 204, методи, заголовки, 10 хв, credentials', async () => {
    const res = await http
      .options('/api/contracts')
      .set('Origin', DOCS)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type, x-csrf-token')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe(DOCS);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, PUT, DELETE');
    expect(res.headers['access-control-allow-headers']).toBe('content-type, authorization, x-csrf-token, x-requested-with, x-tab-id');
    expect(res.headers['access-control-max-age']).toBe('600');
    expect(res.headers.vary).toMatch(/Origin/);
  });

  it('запит з документації з кукою: її origin (не *) і credentials — і читання, і запис', async () => {
    const read = await http.get('/api/contracts').set('Origin', DOCS).set('Cookie', 'sid=x').expect(200);
    expect(read.headers['access-control-allow-origin']).toBe(DOCS);
    expect(read.headers['access-control-allow-credentials']).toBe('true');
    expect(read.headers.vary).toMatch(/Origin/);
    const write = await http.post('/api/contracts').set('Origin', DOCS).send(contract).expect(201);
    expect(write.headers['access-control-allow-origin']).toBe(DOCS);
    const me = await http.get('/auth/me').set('Origin', DOCS).expect(200);
    expect(me.headers['access-control-allow-origin']).toBe(DOCS);
  });

  it('чужий origin — і сусід на тому самому сайті, і схожий на документацію: без CORS', async () => {
    for (const origin of [EVIL, 'https://api-docs.kub.k2.lan.evil.example', 'http://api-docs.kub.k2.lan', 'null']) {
      const pre = await http.options('/api/contracts').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
      expect(pre.headers['access-control-allow-origin']).toBeUndefined();
      expect(pre.headers['access-control-allow-methods']).toBeUndefined();
      const res = await http.get('/api/contracts').set('Origin', origin).expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    }
  });

  it('сторінки, статика й переходи входу — без CORS', async () => {
    for (const path of ['/', '/contracts', '/auth/login', '/k2-security/policy']) {
      const res = await http.get(path).set('Origin', DOCS);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('без API_DOCS_ORIGIN — CORS немає, як і раніше', async () => {
    config.apiDocsOrigin = null;
    const pre = await http.options('/api/contracts').set('Origin', DOCS).set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
    const res = await http.get('/api/contracts').set('Origin', DOCS).expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers.vary ?? '').not.toMatch(/Origin/);
  });

  it('API_DOCS_ORIGIN: лише origin, без здогадок', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(parseOrigin(undefined)).toBeNull();
      expect(parseOrigin('  ')).toBeNull();
      for (const bad of ['*', 'https://api-docs.kub.k2.lan/docs', 'api-docs.kub.k2.lan', 'ftp://api-docs.kub.k2.lan']) {
        expect(parseOrigin(bad)).toBeNull();
      }
      expect(parseOrigin('https://api-docs.kub.k2.lan/')).toBe(DOCS);
      expect(parseOrigin(DOCS)).toBe(DOCS);
    } finally {
      warn.mockRestore();
    }
  });
});
