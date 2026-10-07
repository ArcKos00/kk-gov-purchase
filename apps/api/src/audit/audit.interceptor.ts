import {
  CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { trace } from '@opentelemetry/api';
import type { Request, Response } from 'express';
import { catchError, from, mergeMap, Observable, throwError } from 'rxjs';
import { DataSource } from 'typeorm';
import { AUDIT_ACTION } from './audit.decorator';
import { AuditLog } from './audit.entity';

const SECRET_KEYS = /pass(word)?|secret|token/i;
const MAX_STRING = 2000;

/** Копія тіла/параметрів для журналу: без паролів і з обрізаними довгими рядками. */
function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value !== 'object' || depth > 5) return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '***' : sanitize(v, depth + 1)]),
  );
}

function parseData(body: Record<string, unknown>) {
  // multipart-запити передають дані JSON-рядком у полі data
  if (typeof body.data !== 'string') return body;
  try {
    return { ...body, data: JSON.parse(body.data) };
  } catch {
    return body;
  }
}

/** "contracts/:id/deliveries" → тип сутності "contract" */
function entityType(req: Request): string | null {
  const segment = req.path.replace(/^\/api\//, '').split('/')[0];
  return segment ? segment.replace(/ies$/, 'y').replace(/s$/, '') : null;
}

/**
 * Записує кожну дію користувача в audit_log — після обробки запиту, до відправлення
 * відповіді. Помилка запису в журнал не ламає саму дію: вона логується як error.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const action = this.reflector.get<string | false | undefined>(AUDIT_ACTION, ctx.getHandler());
    if (action === false) return next.handle();

    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const started = Date.now();
    const name = action ?? `${ctx.getClass().name.replace(/Controller$/, '')}.${ctx.getHandler().name}`;

    const write = (statusCode: number, result?: unknown, error?: unknown) =>
      from(this.record(req, name, statusCode, started, result, error));

    return next.handle().pipe(
      mergeMap((result) => write(res.statusCode, result).pipe(mergeMap(() => [result]))),
      catchError((err) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        return write(status, undefined, err).pipe(mergeMap(() => throwError(() => err)));
      }),
    );
  }

  private async record(req: Request, action: string, statusCode: number, started: number, result?: unknown, error?: unknown) {
    const details: Record<string, unknown> = {};
    if (Object.keys(req.query ?? {}).length) details.query = sanitize(req.query);
    if (req.body && Object.keys(req.body).length) details.body = sanitize(parseData(req.body));
    if (req.file) details.file = { name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), size: req.file.size };
    if (error) {
      const response = error instanceof HttpException ? error.getResponse() : undefined;
      details.error = typeof response === 'object' ? sanitize(response) : String((error as Error)?.message ?? error);
    }

    const resultId = (result as { id?: unknown } | undefined)?.id;
    const entityId = req.params?.id ? String(req.params.id) : typeof resultId === 'number' ? String(resultId) : null;
    const loginName = action === 'auth.login' && typeof req.body?.username === 'string' ? req.body.username : null;

    try {
      const repo = this.ds.getRepository(AuditLog);
      await repo.save(repo.create({
        username: req.user?.username ?? loginName,
        action,
        success: statusCode < 400,
        method: req.method,
        path: req.originalUrl.slice(0, 1000),
        statusCode,
        durationMs: Date.now() - started,
        entityType: entityType(req),
        entityId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
        traceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
        details: Object.keys(details).length ? details : null,
      }));
    } catch (e) {
      this.logger.error({ err: e, action, path: req.originalUrl }, 'Не вдалося записати дію в журнал');
    }
  }
}
