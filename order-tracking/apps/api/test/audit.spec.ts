import type { AuditEntry, ContractDetails, Me, Page } from '@order-tracking/shared';
import { contract, createTestApp, deliveryReq, TestApp } from './helpers';

let t: TestApp;
let me: Me;

beforeAll(async () => {
  t = await createTestApp();
  me = (await t.admin.get('/api/auth/me')).body;
});
afterAll(() => t.close());

const audit = async (q: Record<string, string> = {}) =>
  (await t.admin.get('/api/audit').query(q).expect(200)).body as Page<AuditEntry>;

describe('журнал дій', () => {
  it('входи: успішні й невдалі, вихід', async () => {
    await t.anon().post('/api/auth/login').set('User-Agent', 'jest-ua').send({ login: 'admin', password: 'wrong' }).expect(401);
    const a = await t.login('admin', 'admin-password-1');
    await a.post('/api/auth/logout').expect(204);

    const failed = await audit({ action: 'login_failed' });
    expect(failed.items[0]).toMatchObject({ login: 'admin', userAgent: 'jest-ua', changes: { reason: 'bad_password' } });
    expect(failed.items[0].ip).toBeTruthy();
    const logouts = await audit({ action: 'logout' });
    expect(logouts.items[0].user).toMatchObject({ login: 'admin' });
    expect((await audit({ action: 'login' })).total).toBeGreaterThanOrEqual(2);
  });

  it('створення, зміна (diff), файл, поставка, видалення — з автором і прив’язкою до договору', async () => {
    const http = t.admin;
    const c: ContractDetails = (await http.post('/api/contracts').send(contract()).expect(201)).body;
    await http.put(`/api/contracts/${c.id}`).send(contract({
      notes: 'Нова примітка',
      items: c.items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, quantity: i.quantity })),
    })).expect(200);
    await http.put(`/api/contracts/${c.id}/file`).attach('file', Buffer.from('pdf'), 'договір.pdf').expect(200);
    await deliveryReq(http, c.id, [{ orderItemId: c.items[0].id, quantity: 5 }]).attach('file', Buffer.from('x'), 'скан.pdf').expect(201);

    const history: AuditEntry[] = (await http.get(`/api/contracts/${c.id}/history`).expect(200)).body;
    const kinds = history.map((h) => `${h.action}:${h.entity}`);
    expect(kinds).toEqual(expect.arrayContaining([
      'insert:contracts', 'insert:order_items', 'update:contracts', 'insert:files', 'insert:deliveries', 'insert:delivery_lines',
    ]));
    expect(history.every((h) => h.user?.id === me.id && h.contractId === c.id)).toBe(true);
    expect(new Set(history.map((h) => h.requestId)).size).toBeGreaterThan(1);

    const notesChange = history.find((h) => h.action === 'update' && h.entity === 'contracts' && h.changes?.notes)!;
    expect(notesChange.changes).toEqual({ notes: { from: null, to: 'Нова примітка' } });
    // Службові колонки (search_doc, *_search) у diff не потрапляють
    expect(history.some((h) => h.changes && Object.keys(h.changes).some((k) => k.includes('search')))).toBe(false);
    const fileNames = history.filter((h) => h.entity === 'files' && h.action === 'insert').map((h) => h.changes?.original_name);
    expect(fileNames).toEqual(expect.arrayContaining([{ to: 'договір.pdf' }, { to: 'скан.pdf' }]));

    // Видалення договору: каскадні видалення теж у журналі, історія лишається
    await http.delete(`/api/contracts/${c.id}`).expect(204);
    const after: AuditEntry[] = (await http.get(`/api/contracts/${c.id}/history`).expect(200)).body;
    const deleted = after.filter((h) => h.action === 'delete').map((h) => h.entity);
    expect(deleted).toEqual(expect.arrayContaining(['contracts', 'order_items', 'deliveries', 'delivery_lines', 'files']));
    expect(after.find((h) => h.action === 'delete' && h.entity === 'contracts')!.changes?.number).toEqual({ from: 'Д-125/2026' });
  });

  it('зміни користувачів — без хешу пароля', async () => {
    await t.userWithRole('viewer', 'audited');
    const page = await audit({ entity: 'users', action: 'insert' });
    const created = page.items.find((e) => (e.changes?.login as { to?: string })?.to === 'audited')!;
    expect(created.user?.login).toBe('admin');
    expect(JSON.stringify(page)).not.toMatch(/password_hash|\$2[aby]\$/);
  });

  it('фільтри і сторінки', async () => {
    const all = await audit({ pageSize: '2' });
    expect(all.items).toHaveLength(2);
    expect(all.total).toBeGreaterThan(2);
    expect((await audit({ userId: String(me.id), entity: 'contracts' })).items.every((e) => e.entity === 'contracts')).toBe(true);
    expect((await audit({ from: '2000-01-01', to: '2000-01-02' })).total).toBe(0);
    await t.admin.get('/api/audit').query({ action: 'drop' }).expect(422);
  });

  it('bootstrap адміністратора записано як дію системи', async () => {
    const page = await audit({ entity: 'users', action: 'insert', pageSize: '500' });
    const boot = page.items.find((e) => (e.changes?.login as { to?: string })?.to === 'admin')!;
    expect(boot.user).toBeNull();
  });
});
