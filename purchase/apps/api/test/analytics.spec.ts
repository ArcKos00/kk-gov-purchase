import type { AnalyticsDashboard, ContractDetails } from '@kk-gov-purchase/shared';
import { contract, createTestApp, deliveryReq, TestApp } from './helpers';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
  const http = t.admin;
  // A: прострочений, частково поставлений (одна поставка вчасно, одна із запізненням)
  const a: ContractDetails = (await http.post('/api/contracts').send(contract({
    number: 'A-1', counterparty: 'ТОВ Альфа', contractDate: '2026-01-10', expectedDeliveryDate: '2026-02-01',
    items: [{ name: 'Болт', unit: 'шт', quantity: 100, price: 10 }],
  })).expect(201)).body;
  await deliveryReq(http, a.id, [{ orderItemId: a.items[0].id, quantity: 30 }], 'N1', '2026-01-25').expect(201);
  await deliveryReq(http, a.id, [{ orderItemId: a.items[0].id, quantity: 20 }], 'N2', '2026-02-05').expect(201);

  // B: виконаний (частина — недопоставка)
  const b: ContractDetails = (await http.post('/api/contracts').send(contract({
    number: 'B-1', counterparty: 'тов альфа', contractDate: '2026-02-15', expectedDeliveryDate: '2099-01-01',
    items: [{ name: 'болт', unit: 'шт', quantity: 10, price: 12 }, { name: 'Шайба', unit: 'шт', quantity: 5, price: 1 }],
  })).expect(201)).body;
  await deliveryReq(http, b.id, [{ orderItemId: b.items[0].id, quantity: 10 }], 'N3', '2026-03-01').expect(201);
  await http.put(`/api/contracts/${b.id}/shortfall`).send({
    expectedDeliveryDate: '2099-01-01', items: [{ orderItemId: b.items[1].id, cancelled: 5, cancelReason: 'Немає' }],
  }).expect(200);

  // C: очікується, інший контрагент, без цін
  await http.post('/api/contracts').send(contract({
    number: 'C-1', counterparty: 'ПП Бета', contractDate: '2026-04-01', expectedDeliveryDate: null,
    items: [{ name: 'Фарба', unit: 'кг', quantity: 7 }],
  })).expect(201);
});
afterAll(() => t.close());

const dashboard = async (q: Record<string, string> = {}) =>
  (await t.admin.get('/api/analytics').query(q).expect(200)).body as AnalyticsDashboard;

describe('аналітика', () => {
  it('KPI', async () => {
    const d = await dashboard();
    expect(d.kpis).toMatchObject({
      contracts: 3,
      amount: 100 * 10 + 10 * 12 + 5 * 1,
      receivedAmount: 50 * 10 + 10 * 12,
      pendingAmount: 50 * 10,
      cancelledAmount: 5,
      quantity: 122,
      received: 60,
      pending: 57,
      cancelled: 5,
      overdue: 1,
      overdueAmount: 500,
      withShortfall: 1,
      completed: 1,
      deliveries: 3,
      counterparties: 2,
    });
    expect(d.kpis.onTimeShare).toBeCloseTo(2 / 3);
  });

  it('за станом, контрагентом (без урахування регістру), періодом, найменуваннями', async () => {
    const d = await dashboard({ granularity: 'month' });
    expect(Object.fromEntries(d.byStatus.map((s) => [s.status, s.contracts]))).toEqual({ waiting: 1, partial: 0, overdue: 1, completed: 1 });
    expect(d.byCounterparty[0]).toMatchObject({ contracts: 2, amount: 1125, overdue: 1 });
    expect(d.byCounterparty.map((c) => c.contracts)).toEqual([2, 1]);
    expect(d.byPeriod.map((p) => p.period)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
    expect(d.byPeriod[1]).toMatchObject({ contracts: 1, amount: 125, deliveries: 1, late: 1, receivedQuantity: 20 });
    expect(d.topItems[0]).toMatchObject({ name: 'Болт', contracts: 2, quantity: 110, received: 60, amount: 1120 });
    const q = await dashboard({ granularity: 'quarter' });
    expect(q.byPeriod.map((p) => p.period)).toEqual(['2026-01-01', '2026-04-01']);
  });

  it('своєчасність і прострочені договори', async () => {
    const { timeliness } = await dashboard();
    expect(timeliness).toMatchObject({ deliveries: 3, onTime: 2, late: 1, noDeadline: 0, avgDelayDays: 4 });
    expect(timeliness.overdueContracts).toEqual([expect.objectContaining({ number: 'A-1', pending: 50, pendingAmount: 500 })]);
  });

  it('ті самі фільтри, що й у списку договорів', async () => {
    expect((await dashboard({ counterparty: 'бета' })).kpis.contracts).toBe(1);
    expect((await dashboard({ dateFrom: '2026-02-01', dateTo: '2026-12-31' })).kpis.contracts).toBe(2);
    expect((await dashboard({ status: 'overdue' })).kpis).toMatchObject({ contracts: 1, deliveries: 2 });
    expect((await dashboard({ q: 'шайба' })).kpis.contracts).toBe(1);
    expect((await dashboard({ q: 'нічого такого немає' })).kpis).toMatchObject({ contracts: 0, onTimeShare: null, receivedShare: 0 });
  });
});
