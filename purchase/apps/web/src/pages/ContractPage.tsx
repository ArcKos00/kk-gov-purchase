import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { fdate, fmoney, fq, fsize } from '../lib/format';
import { useAuth } from '../auth/auth';
import { HistoryTimeline } from '../components/AuditView';
import { useConfirm } from '../components/dialog';
import { useToast } from '../components/toast';
import { errorText, LoadError, Loading, PageHead, ProgressBar, StatusPill } from '../components/ui';

export function ContractPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit } = useAuth();
  const [tab, setTab] = useState<'items' | 'history'>('items');
  const { data: c, error, isPending, refetch } = useQuery({ queryKey: ['contract', id], queryFn: () => api.get(id) });
  const history = useQuery({ queryKey: ['contract-history', id], queryFn: () => api.history(id), enabled: tab === 'history' });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['contracts'] });
    qc.invalidateQueries({ queryKey: ['contract-history', id] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };

  const removeContract = useMutation({
    mutationFn: () => api.remove(id),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['contract', id] });
      invalidate();
      navigate('/contracts', { state: { flash: `Договір № ${c?.number} видалено.` } });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const removeDelivery = useMutation({
    mutationFn: (deliveryId: number) => api.removeDelivery(deliveryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract', id] });
      invalidate();
      toast.ok('Поставку видалено.');
    },
    onError: (e) => toast.error(errorText(e)),
  });

  if (isPending) return <Loading />;
  if (error) return <LoadError error={error} onRetry={() => void refetch()} />;

  const items = new Map(c.items.map((i) => [i.id, i]));
  const hasMoney = c.totals.amount !== null;

  const askRemoveContract = async () => {
    if (await confirm({
      title: `Видалити договір № ${c.number}?`,
      text: `Разом з договором буде видалено ${c.items.length} найменувань, ${c.deliveries.length} поставок і всі прикріплені файли. Дію не можна скасувати.`,
      confirmText: 'Видалити договір',
    })) removeContract.mutate();
  };
  const askRemoveDelivery = async (deliveryId: number, invoice: string) => {
    if (await confirm({ title: `Видалити поставку за накладною № ${invoice}?`, text: 'Отримана кількість зменшиться, скан накладної буде видалено.' }))
      removeDelivery.mutate(deliveryId);
  };

  return (
    <>
      <PageHead
        back={<Link to="/contracts" className="small">← до списку</Link>}
        title={<>Договір № {c.number} <StatusPill status={c.status} /></>}
        subtitle={c.counterparty}
        actions={canEdit && (
          <>
            <Link className="btn primary" to={`/contracts/${id}/deliveries/new`}>＋ Додати поставку</Link>
            <Link className="btn" to={`/contracts/${id}/shortfall`}>Недопоставка / дата</Link>
            <Link className="btn" to={`/contracts/${id}/edit`}>Редагувати</Link>
            <button type="button" className="btn danger" onClick={() => void askRemoveContract()} disabled={removeContract.isPending}>Видалити</button>
          </>
        )}
      />

      <div className="qty4">
        <div><span className="k">Замовлено</span><span className="v">{fq(c.totals.quantity)}</span>{hasMoney && <span className="m">{fmoney(c.totals.amount)}</span>}</div>
        <div><span className="k">Отримано</span><span className="v c-ok">{fq(c.totals.received)}</span>{hasMoney && <span className="m">{fmoney(c.totals.receivedAmount)}</span>}</div>
        <div><span className="k">Очікуємо</span><span className="v c-info">{fq(c.totals.pending)}</span>{hasMoney && <span className="m">{fmoney(c.totals.pendingAmount)}</span>}</div>
        <div><span className="k">Не зможуть</span><span className="v c-danger">{fq(c.totals.cancelled)}</span>{hasMoney && <span className="m">{fmoney(c.totals.cancelledAmount)}</span>}</div>
      </div>

      <div className="panel panel-b">
        <dl className="meta">
          <dt>Номер договору</dt><dd>{c.number}</dd>
          <dt>Дата договору</dt><dd className="num">{fdate(c.contractDate)}</dd>
          <dt>Контрагент</dt><dd><Link to={`/contracts?counterparty=${encodeURIComponent(c.counterparty)}`}>{c.counterparty}</Link></dd>
          <dt>Орієнтовна дата поставки</dt>
          <dd>
            <span className="num">{fdate(c.expectedDeliveryDate)}</span>
            {c.status === 'overdue' && <span className="c-danger small"> (прострочено)</span>}
          </dd>
          <dt>Файл договору</dt>
          <dd>
            {c.file
              ? <><a href={api.fileUrl(c.file.id)}>{c.file.name}</a> <span className="muted small">({fsize(c.file.size)})</span></>
              : <span className="muted">не завантажено</span>}
          </dd>
          {c.notes && <><dt>Примітки</dt><dd className="pre">{c.notes}</dd></>}
        </dl>
      </div>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'items'} className={tab === 'items' ? 'on' : ''} onClick={() => setTab('items')}>
          Найменування й поставки
        </button>
        <button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          Історія змін
        </button>
      </div>

      {tab === 'history' ? (
        history.isPending ? <Loading /> : history.error ? <LoadError error={history.error} /> : history.data.length === 0
          ? <div className="panel empty">Змін ще не було.</div>
          : <div className="panel panel-b"><HistoryTimeline entries={history.data} /></div>
      ) : (
        <>
          <h2>Найменування</h2>
          <div className="panel tbl-box">
            <table>
              <thead>
                <tr>
                  <th>Найменування</th><th className="r">Замовлено</th>{hasMoney && <th className="r">Ціна</th>}{hasMoney && <th className="r">Сума</th>}
                  <th className="r">Отримано</th><th className="r">Очікуємо</th><th className="r">Не зможуть</th><th />
                </tr>
              </thead>
              <tbody>
                {c.items.map((i) => (
                  <tr key={i.id} id={`item-${i.id}`}>
                    <td>{i.name}{i.cancelReason && <div className="small c-danger">{i.cancelReason}</div>}</td>
                    <td className="r tight num">{fq(i.quantity)} {i.unit}</td>
                    {hasMoney && <td className="r tight num">{fmoney(i.price)}</td>}
                    {hasMoney && <td className="r tight num">{fmoney(i.amount)}</td>}
                    <td className="r num c-ok">{fq(i.received)}</td>
                    <td className="r num c-info"><b>{fq(i.pending)}</b></td>
                    <td className="r num c-danger">{fq(i.cancelled)}</td>
                    <td style={{ width: 140 }}><ProgressBar total={i.quantity} received={i.received} cancelled={i.cancelled} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Поставки</h2>
          {c.deliveries.length === 0 ? <div className="panel empty">Поставок ще не було.</div> : (
            <div className="panel tbl-box">
              <table>
                <thead><tr><th>Дата</th><th>Накладна</th><th>Що приїхало</th><th>Файл</th>{canEdit && <th />}</tr></thead>
                <tbody>
                  {c.deliveries.map((d) => (
                    <tr key={d.id} id={`delivery-${d.id}`}>
                      <td className="tight num">{fdate(d.date)}</td>
                      <td>№ {d.invoiceNumber}{d.notes && <div className="small muted pre">{d.notes}</div>}</td>
                      <td className="small">
                        {d.lines.map((l) => {
                          const it = items.get(l.orderItemId);
                          return <div key={l.orderItemId}>{it?.name} — <span className="num">{fq(l.quantity)}</span> {it?.unit}</div>;
                        })}
                      </td>
                      <td className="small">{d.file && <a href={api.fileUrl(d.file.id)}>{d.file.name}</a>}</td>
                      {canEdit && (
                        <td className="r">
                          <button type="button" className="btn sm danger" onClick={() => void askRemoveDelivery(d.id, d.invoiceNumber)} disabled={removeDelivery.isPending}>
                            Видалити
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
