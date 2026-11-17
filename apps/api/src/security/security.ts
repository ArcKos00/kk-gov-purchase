import { isIP } from 'node:net';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { SecurityPolicy } from '@k2/security';
import {
  NO_STORE_HEADERS,
  overridesFromEnv,
  resolvePolicy,
  SECURITY_HEADERS,
  startupEvents,
  type EventContext,
  type SecurityEcsEvent,
} from '@k2/security/server';
import { currentUser } from '../audit/audit-context';
import type { SessionRequest, SessionUser } from '../auth/session';

/**
 * Безпековий шаблон К-2 (`@k2/security` 0.3.0, репо kk-security-lib, його `docs/design.md`): водяний знак
 * «Ім'я (логін) · дата час» поверх усіх екранів для всіх (і на вході, і в анонімному перегляді — там назва
 * застосунку) і заборона друку. Заборони скріншотів немає свідомо (рішення 2026-11-16: знімок робить ОС,
 * сторінка його не перехопить) — знімок не анонімний завдяки знаку.
 *
 * Політику рахує сервер (`GET /k2-security/policy`, security.controller.ts), браузер лише виконує
 * (apps/web/src/Security.tsx); поки її немає, вона зламана чи сервер не відповів — усе ввімкнено.
 */

/** id застосунку в шаблоні — `service.name` подій і `app` політики. `k2-module.json` у застосунку немає (не модуль Warspace). */
export const SECURITY_APP = 'gov-purchase';

/**
 * Розділ `security`, яким був би наш `k2-module.json` (застосунок — не модуль Warspace, маніфесту немає; тест
 * перевіряє його `checkManifestSecurity` і версію шаблону). Відступів від шаблону немає.
 */
export const MANIFEST_SECURITY = { baseline: 1, deviations: [] } as const;

type Env = Record<string, string | undefined>;

/**
 * Перемикачі середовища `K2_SECURITY_PRINT` / `K2_SECURITY_WATERMARK` (`on`/`off`) — лише dev і стенди, у проді їх
 * немає (deploy.yaml). Кожен — подія `config_override` на старті (security.controller.ts), тобто видно в SIEM.
 */
export function securityOverrides(env: Env = process.env) {
  return overridesFromEnv(env);
}

/** `service.environment` подій — те саме, що в телеметрії (telemetry/config.ts): у проді `gov`. */
export function securityEnvironment(env: Env = process.env): string {
  return env.OTEL_DEPLOYMENT_ENVIRONMENT || env.ELASTIC_APM_ENVIRONMENT || env.NODE_ENV || 'development';
}

/**
 * Політика для цієї людини. Без людини (не увійшла, анонімний перегляд) — усе ввімкнено, знак з назвою
 * застосунку (fail-closed).
 *
 * Персональних винятків тут немає ніколи: реєстр винятків живе в K2 Auth і доходить лише claim-ом `k2_sec`
 * ID-токена K2 Auth (`exemptionsFromClaims`). Застосунок входить напряму в Keycloak (клієнт `gov_purchase`,
 * PKCE), повз K2 Auth, — у його токенах `k2_sec` немає, тож `exemptions` завжди `[]`: друк заборонено всім.
 * Це fail-closed і так задумано; іншого джерела винятків не вигадуємо. Перейде застосунок на вхід через
 * K2 Auth — тоді `exemptionsFromClaims(claims ID-токена)`.
 */
export function securityPolicyFor(user: SessionUser | null, options: { env?: Env; now?: Date } = {}): SecurityPolicy {
  const login = user?.username?.trim();
  return resolvePolicy({
    app: SECURITY_APP,
    manifest: MANIFEST_SECURITY,
    user: login ? { login, name: user?.displayName ?? null } : null,
    exemptions: [],
    overrides: securityOverrides(options.env),
    now: options.now,
  });
}

/** Події на старті: по `config_override` на кожен перемикач середовища. */
export function securityStartupEvents(env: Env = process.env): SecurityEcsEvent[] {
  return startupEvents({ app: SECURITY_APP, environment: securityEnvironment(env) }, securityOverrides(env));
}

/** `source.ip` події: IPv4 без префікса `::ffff:`; не IP — без адреси (подія потрібна й так). */
export function clientIp(raw: string | undefined): string | undefined {
  let ip = raw?.trim() ?? '';
  if (/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip)) ip = ip.slice(7);
  return isIP(ip) ? ip.toLowerCase() : undefined;
}

/** Контекст подій з браузера (`acceptClientEvents`): застосунок, середовище, хто, звідки. */
export function securityEventContext(req: Request, user: SessionUser | null, env: Env = process.env): EventContext {
  return {
    app: SECURITY_APP,
    environment: securityEnvironment(env),
    user: user ? { login: user.username } : null,
    // за ingress (trust proxy) — адреса клієнта з X-Forwarded-For, як у журналі дій
    sourceIp: clientIp(req.ip),
    userAgent: req.get('user-agent') || undefined,
  };
}

// ---------- заголовки ----------

/**
 * Заголовки шаблону (`SECURITY_HEADERS`: `Permissions-Policy` з `display-capture=()`, `nosniff`,
 * `Referrer-Policy`) на всі відповіді — статику, сторінки, API, помилки. Ставиться першим у setup.ts.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  next();
};

// ---------- POST /k2-security/events: брама до контролера ----------

/** Найбільше тіло `POST /k2-security/events` (spec @k2/security §6: більше — 413). */
export const MAX_EVENTS_BODY_BYTES = 64 * 1024;

/**
 * Запит з іншого сайту (CSRF): браузер каже `Sec-Fetch-Site` — `same-origin` (чи `none`, дія самої людини) свій,
 * `same-site` / `cross-site` — ні. Без нього (старий браузер) — `Origin` має бути цим хостом. Без обох — не
 * браузер, кукі людини в нього немає.
 */
export function isCrossSite(req: Request): boolean {
  const site = req.get('sec-fetch-site')?.trim().toLowerCase();
  if (site === 'same-origin' || site === 'none') return false;
  const origin = req.get('origin');
  if (!origin) return site === 'same-site' || site === 'cross-site';
  if (origin === 'null') return true;
  const host = (req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0]?.trim().toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() !== host;
  } catch {
    return true;
  }
}

/**
 * Перевірки `POST /k2-security/events` до контролера, у порядку шаблону: 403 з іншого сайту, 401 без сесії
 * (анонімний перегляд теж — події без людини SIEM не засмічують), 413 тіло > 64 КБ, 400 не JSON. Тіло читає
 * сама (з лімітом 64 КБ, а не 100 КБ загального парсера Nest) і кладе розібране в `req.body` — далі
 * security.controller.ts відповідає 204. Реєструється в setup.ts після сесії, до парсерів Nest (ті бачать
 * прочитаний запит і його не чіпають).
 */
export const securityEventsGate: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'POST') return next();
  const deny = (status: number) => {
    if (!res.headersSent) res.status(status).set(NO_STORE_HEADERS).end();
  };
  if (isCrossSite(req)) return deny(403);
  if (!currentUser(req as SessionRequest)) return deny(401);
  const declared = Number(req.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_EVENTS_BODY_BYTES) {
    res.set('connection', 'close');
    return deny(413);
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let settled = false;
  req.on('data', (chunk: Buffer) => {
    if (settled) return;
    size += chunk.length;
    if (size > MAX_EVENTS_BODY_BYTES) {
      settled = true;
      res.set('connection', 'close');
      deny(413);
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (settled) return;
    settled = true;
    try {
      req.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return deny(400);
    }
    next();
  });
  // обірване тіло — як сміття
  req.on('error', () => {
    if (settled) return;
    settled = true;
    deny(400);
  });
};
