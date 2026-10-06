import type { Me, UserInfo } from '@kk-gov-purchase/shared';
import { ADMIN, contract, createTestApp, TestApp } from './helpers';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('health', () => {
  it('доступний без входу і перевіряє БД', async () => {
    const res = await t.anon().get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });
});

describe('вхід і сесії', () => {
  it('без сесії API відповідає 401', async () => {
    await t.anon().get('/api/contracts').expect(401);
    await t.anon().get('/api/contracts/counterparties').expect(401);
    await t.anon().post('/api/contracts').send(contract()).expect(401);
    await t.anon().get('/api/files/1').expect(401);
  });

  it('перший адміністратор створений з env; cookie httpOnly + SameSite=Lax', async () => {
    const res = await t.anon().post('/api/auth/login').send({ login: ' ADMIN ', password: ADMIN.password }).expect(200);
    expect(res.body).toMatchObject({ login: 'admin', role: 'admin', fullName: 'Головний Адміністратор' } satisfies Partial<Me>);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/ot_sid=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('me / logout: після виходу сесія недійсна', async () => {
    const a = await t.login(ADMIN.login, ADMIN.password);
    expect((await a.get('/api/auth/me').expect(200)).body.login).toBe('admin');
    await a.post('/api/auth/logout').expect(204);
    await a.get('/api/auth/me').expect(401);
  });

  it('невірний пароль — 401 з однаковим повідомленням', async () => {
    const a = await t.anon().post('/api/auth/login').send({ login: 'admin', password: 'wrong' }).expect(401);
    const b = await t.anon().post('/api/auth/login').send({ login: 'nobody', password: 'wrong' }).expect(401);
    expect(a.body.message).toBe('Невірний логін або пароль');
    expect(b.body.message).toBe(a.body.message);
  });

  it('блокує обліковий запис після N невдалих спроб поспіль', async () => {
    await t.userWithRole('viewer', 'victim');
    for (let i = 0; i < 2; i++) await t.anon().post('/api/auth/login').send({ login: 'victim', password: 'bad' }).expect(401);
    const locked = await t.anon().post('/api/auth/login').send({ login: 'victim', password: 'bad' }).expect(429);
    expect(locked.body.message).toMatch(/Забагато невдалих спроб/);
    // Навіть правильний пароль не пускає, доки діє блокування.
    await t.anon().post('/api/auth/login').send({ login: 'victim', password: 'password-123' }).expect(429);
    const users: UserInfo[] = (await t.admin.get('/api/users').expect(200)).body;
    const victim = users.find((u) => u.login === 'victim')!;
    expect(victim.lockedUntil).not.toBeNull();
    // Скидання пароля адміністратором знімає блокування.
    await t.admin.put(`/api/users/${victim.id}/password`).send({ password: 'new-password-1' }).expect(200);
    await t.login('victim', 'new-password-1');
  });

  it('зміна власного пароля', async () => {
    const a = await t.userWithRole('editor', 'pwuser');
    const err = await a.put('/api/auth/password').send({ currentPassword: 'nope', newPassword: 'another-pass-1' }).expect(422);
    expect(err.body.errors.currentPassword).toBe('Невірний поточний пароль');
    await a.put('/api/auth/password').send({ currentPassword: 'password-123', newPassword: 'another-pass-1' }).expect(204);
    await a.get('/api/auth/me').expect(200);
    await t.login('pwuser', 'another-pass-1');
  });

  it('бере IP клієнта з X-Forwarded-For (trust proxy)', async () => {
    await t.anon().post('/api/auth/login').set('X-Forwarded-For', '203.0.113.7').send({ login: 'admin', password: 'x' }).expect(401);
    const [row] = await t.ds.query("SELECT ip FROM audit_log WHERE action = 'login_failed' ORDER BY id DESC LIMIT 1");
    expect(row.ip).toBe('203.0.113.7');
  });
});

describe('ролі', () => {
  it('viewer лише читає', async () => {
    const viewer = await t.userWithRole('viewer');
    await viewer.get('/api/contracts').expect(200);
    await viewer.get('/api/analytics').expect(200);
    await viewer.get('/api/search').query({ q: 'болт' }).expect(200);
    await viewer.post('/api/contracts').send(contract()).expect(403);
    await viewer.get('/api/users').expect(403);
    await viewer.get('/api/audit').expect(403);
    // Вихід і зміна власного пароля доступні будь-якій ролі.
    await viewer.post('/api/auth/logout').expect(204);
  });

  it('editor змінює дані, але не керує користувачами', async () => {
    const editor = await t.userWithRole('editor');
    const c = (await editor.post('/api/contracts').send(contract({ number: 'E-1' })).expect(201)).body;
    await editor.delete(`/api/contracts/${c.id}`).expect(204);
    await editor.post('/api/users').send({ login: 'x', fullName: 'X', role: 'admin', password: 'password-123' }).expect(403);
  });
});

describe('керування користувачами', () => {
  it('створення, дублікат логіна, валідація', async () => {
    await t.admin.post('/api/users').send({ login: 'Petro', fullName: 'Петро', role: 'editor', password: 'password-123' }).expect(201);
    const dup = await t.admin.post('/api/users').send({ login: 'petro', fullName: 'Інший', role: 'viewer', password: 'password-123' }).expect(422);
    expect(dup.body.errors.login).toMatch(/уже існує/);
    const bad = await t.admin.post('/api/users').send({ login: '', fullName: '', role: 'boss', password: '1' }).expect(422);
    expect(Object.keys(bad.body.errors).sort()).toEqual(['fullName', 'login', 'password', 'role']);
  });

  it('деактивація завершує сесії; роль змінюється', async () => {
    const a = await t.userWithRole('editor', 'deact');
    const users: UserInfo[] = (await t.admin.get('/api/users').expect(200)).body;
    const u = users.find((x) => x.login === 'deact')!;
    await t.admin.patch(`/api/users/${u.id}`).send({ role: 'viewer' }).expect(200);
    await a.post('/api/contracts').send(contract({ number: 'Z' })).expect(403);
    await t.admin.patch(`/api/users/${u.id}`).send({ active: false }).expect(200);
    await a.get('/api/auth/me').expect(401);
    const res = await t.anon().post('/api/auth/login').send({ login: 'deact', password: 'password-123' }).expect(401);
    expect(res.body.message).toMatch(/вимкнено/);
  });

  it('адміністратор не може вимкнути себе', async () => {
    const me: Me = (await t.admin.get('/api/auth/me')).body;
    const res = await t.admin.patch(`/api/users/${me.id}`).send({ active: false }).expect(422);
    expect(res.body.errors._).toMatch(/себе/);
  });
});
