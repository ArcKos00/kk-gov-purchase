import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config';

/**
 * Захист від CSRF перевіркою `Origin` (1.4.0) — як `fromThisSite` у kk-bastion.
 *
 * Навіщо: кука `sid` — `SameSite=Lax`, а сусідні сервіси `*.kub.k2.lan` — той самий сайт, тож браузер шле куку і з
 * їхніх сторінок. Без цієї перевірки сторінка `https://evil.kub.k2.lan` могла б надіслати форму чи multipart
 * (вони без preflight) на `/api/*` від імені людини.
 *
 * Правило для небезпечних методів (усе, крім GET / HEAD / OPTIONS) на `/api/*` і `/auth/*`:
 *   * є `Origin` — він має точно дорівнювати origin самого сервісу (`PUBLIC_URL` — адреса, яку бачить браузер; з
 *     неї ж redirect URI входу) або, лише для `/api/*`, точно `API_DOCS_ORIGIN` («Try it out» з «Документації API»);
 *     інше (сусід, `null`, схожий хост, інша схема) — 403;
 *   * `Origin` немає — дивимось `Sec-Fetch-Site`: `same-origin` — свій; будь-яке інше значення (`same-site`,
 *     `cross-site`, `none`) — 403;
 *   * немає ні `Origin`, ні `Sec-Fetch-Site` — пропускаємо, як Бастіон: сучасний браузер на запис з іншого
 *     сайту завжди ставить хоча б один із них, тож такий запит — не браузер (curl, скрипт, сервер-сервер), і кук
 *     людини в нього немає — без сесії маршрути змін і так дають 401. Так само проходить і back-channel виклик
 *     сервер-сервер, якщо він колись з'явиться.
 *
 * Винятки — кроки входу (`LOGIN_STEPS`): `/auth/login` і `/auth/callback` приходять переходом браузера з/на сторінку
 * Keycloak (зараз GET, тож перевірку й так не проходять; виняток — щоб і `response_mode=form_post` від Keycloak,
 * з його `Origin`, не зламався). Back-channel logout від K2 Auth / Keycloak у застосунку немає (вхід напряму в
 * Keycloak, маршруту немає), окремого винятку не потрібно — див. правило «ні `Origin`, ні `Sec-Fetch-Site`».
 *
 * `POST /k2-security/events` має власну браму (`securityEventsGate`, security.ts) — тут не чіпаємо.
 */

/** Методи без побічних дій — їх не перевіряємо. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Кроки входу: перехід браузера від/до Keycloak — без перевірки Origin. */
export const LOGIN_STEPS: ReadonlySet<string> = new Set(['/auth/login', '/auth/callback']);

/** JSON 403 (форма — як у помилок Nest: `message` читає фронт). */
export const CROSS_SITE_ERROR = {
  statusCode: 403,
  error: 'Forbidden',
  code: 'cross_site',
  message: 'Запит прийшов з іншого сайту — зміни можна робити лише зі сторінки застосунку.',
} as const;

/**
 * Шлях для перевірки: Express маршрутизує без урахування регістру — приводимо до нижнього регістру й одного `/`,
 * щоб `/API/contracts` чи `//api/...` не обійшли перевірку.
 */
function normalize(path: string): string {
  return path.toLowerCase().replace(/\/{2,}/g, '/');
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/** origin самого сервісу: з `PUBLIC_URL` (у проді `https://purchase.gov.kub.k2.lan`). */
export function ownOrigin(publicUrl = config.publicUrl): string | null {
  try {
    return new URL(publicUrl).origin;
  } catch {
    return null;
  }
}

/** Чи дозволено цей запит (лише рішення, без відповіді). */
export function originAllowed(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const path = normalize(req.path);
  const api = under(path, '/api');
  if (!api && !under(path, '/auth')) return true;
  if (LOGIN_STEPS.has(path.replace(/\/$/, ''))) return true;

  const origin = req.get('origin');
  if (origin !== undefined) {
    if (origin === ownOrigin()) return true;
    return api && !!config.apiDocsOrigin && origin === config.apiDocsOrigin;
  }
  const site = req.get('sec-fetch-site');
  if (site === undefined) return true; // не браузер — кук людини немає (див. вище)
  return site.trim().toLowerCase() === 'same-origin';
}

/** Брама: 403 з JSON-помилкою українською. Ставиться в setup.ts після CORS (щоб документація прочитала 403). */
export const originCheck: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (originAllowed(req)) return next();
  res.status(403).set('Cache-Control', 'no-store').json(CROSS_SITE_ERROR);
};
