import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config';

/**
 * CORS для «Документації API» (kk-api-docs, 1.3.0): її «Try it out» викликає API з браузера людини, з її власною
 * сесією (кука `sid`, `SameSite=Lax` — сервіси на тому самому сайті `*.kub.k2.lan`, тож кука йде і так).
 *
 * Рівно один origin — `API_DOCS_ORIGIN` (`config.apiDocsOrigin`; у deploy.yaml `https://api-docs.kub.k2.lan`).
 * Порожньо — CORS немає, як і раніше. Лише точний збіг `Origin` отримує `Access-Control-Allow-Origin` (саме цей
 * origin, ніколи `*` і ніколи «що прийшло») з credentials; будь-який інший — нічого, браузер не віддасть відповідь
 * своїй сторінці, а preflight для запису з JSON чи власним заголовком не пройде.
 *
 * Стосується маршрутів API — `/api/*`, `/auth/me`, `/auth/logout` (setup.ts), не сторінок і статики; переходи
 * входу (`/auth/login`, `/auth/callback`) — не API.
 */

/** Методи, які API має (контролери Nest). */
export const API_CORS_METHODS = 'GET, POST, PUT, DELETE';

/** Що може нести запит «Try it out»: звичайні і власний заголовок API — вкладка (`X-Tab-Id`, журнал дій). */
export const API_CORS_HEADERS = 'content-type, authorization, x-csrf-token, x-requested-with, x-tab-id';

/** Скільки браузер тримає відповідь preflight, с. */
export const API_CORS_MAX_AGE = '600';

/** Шляхи API поза `/api` (контролер auth, описаний в openapi.ts). */
const AUTH_API_PATHS = new Set(['/auth/me', '/auth/logout']);

/** Чи запит — до API (а не сторінка, статика чи перехід входу). */
export function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/') || AUTH_API_PATHS.has(path);
}

export const apiDocsCors: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const allowed = config.apiDocsOrigin;
  if (!allowed || !isApiPath(req.path)) return next();
  res.vary('Origin');
  if (req.get('origin') !== allowed) return next();

  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS' && req.get('access-control-request-method')) {
    res.setHeader('Access-Control-Allow-Methods', API_CORS_METHODS);
    res.setHeader('Access-Control-Allow-Headers', API_CORS_HEADERS);
    res.setHeader('Access-Control-Max-Age', API_CORS_MAX_AGE);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(204).end();
  }
  next();
};
