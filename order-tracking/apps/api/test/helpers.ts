import fs from 'node:fs';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import type { ContractInput, Role } from '@order-tracking/shared';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup';
import { config } from '../src/config';

export type Agent = ReturnType<typeof request.agent>;

export interface TestApp {
  app: INestApplication;
  ds: DataSource;
  /** Без cookie */
  anon: () => ReturnType<typeof request>;
  /** Агент, що зберігає cookie сесії */
  agent: () => Agent;
  login: (login: string, password: string) => Promise<Agent>;
  admin: Agent;
  /** Створює користувача з роллю і повертає залогіненого агента */
  userWithRole: (role: Role, login?: string) => Promise<Agent>;
  close: () => Promise<void>;
}

export const ADMIN = { login: 'admin', password: 'admin-password-1' };

/** Піднімає застосунок на чистій БД (схему знищує) і логіниться адміністратором з env. */
export async function createTestApp(): Promise<TestApp> {
  const reset = await new DataSource({ type: 'postgres', url: config.databaseUrl }).initialize();
  await reset.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await reset.destroy();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  const server = app.getHttpServer();

  const login = async (l: string, password: string) => {
    const a = request.agent(server);
    await a.post('/api/auth/login').send({ login: l, password }).expect(200);
    return a;
  };
  const admin = await login(ADMIN.login, ADMIN.password);
  let n = 0;

  return {
    app,
    ds: app.get(DataSource),
    anon: () => request(server),
    agent: () => request.agent(server),
    login,
    admin,
    userWithRole: async (role, l = `${role}${++n}`) => {
      await admin.post('/api/users').send({ login: l, fullName: `Користувач ${l}`, role, password: 'password-123' }).expect(201);
      return login(l, 'password-123');
    },
    close: async () => {
      await app.close();
      fs.rmSync(config.uploadsDir, { recursive: true, force: true });
    },
  };
}

export const contract = (patch: Partial<ContractInput> = {}): ContractInput => ({
  number: 'Д-125/2026',
  counterparty: 'ТОВ "Постачальник"',
  contractDate: '2026-09-01',
  expectedDeliveryDate: '2099-10-20',
  notes: null,
  items: [
    { name: 'Болт М8', unit: 'шт', quantity: 100 },
    { name: 'Гайка М8', unit: 'шт', quantity: 50 },
  ],
  ...patch,
});

export const deliveryReq = (
  http: Agent, id: number, lines: { orderItemId: number; quantity: number }[], invoiceNumber = 'ВН-001', date = '2026-09-15',
) => http.post(`/api/contracts/${id}/deliveries`).field('data', JSON.stringify({ date, invoiceNumber, notes: null, lines }));
