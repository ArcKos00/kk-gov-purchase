import { EntitySubscriberInterface, EventSubscriber, TransactionStartEvent } from 'typeorm';
import { currentContext } from '../common/request-context';

/**
 * На початку кожної транзакції TypeORM передає в Postgres контекст запиту (хто/звідки)
 * через транзакційну змінну `app.audit_ctx`. Її читає тригер audit_row() (див. міграцію Audit),
 * тож журнал змін ведеться для всіх таблиць без коду в кожному сервісі.
 * Тому всі зміни даних мають виконуватись у транзакції (ds.transaction або save/remove репозиторію).
 */
@EventSubscriber()
export class AuditContextSubscriber implements EntitySubscriberInterface {
  async afterTransactionStart(event: TransactionStartEvent): Promise<void> {
    const ctx = currentContext();
    if (!ctx) return;
    const payload = JSON.stringify({
      userId: ctx.userId ?? null,
      login: ctx.login ?? null,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      contractId: ctx.contractId ?? null,
    });
    await event.queryRunner.query("SELECT set_config('app.audit_ctx', $1, true)", [payload]);
  }
}
