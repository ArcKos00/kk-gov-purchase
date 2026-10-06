import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Контекст поточного HTTP-запиту (AsyncLocalStorage): хто, звідки, id запиту.
 * Його читає AuditContextSubscriber, щоб тригер журналу знав автора змін.
 */
export interface RequestContext {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  userId?: number;
  login?: string;
  /** Договір з адреси запиту (/contracts/:id/...) — для прив'язки змін файлів до договору */
  contractId?: number;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const currentContext = () => requestContext.getStore();

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const ctx: RequestContext = {
    requestId: crypto.randomUUID(),
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
  };
  res.setHeader('X-Request-Id', ctx.requestId);
  requestContext.run(ctx, () => next());
}
