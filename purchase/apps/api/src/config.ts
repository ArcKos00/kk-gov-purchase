import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const num = (v: string | undefined, def: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : def);
const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : /^(1|true|yes|on)$/i.test(v));

/**
 * Express "trust proxy": звідки брати реальну IP клієнта (X-Forwarded-For).
 * "true"/"false", число переходів або перелік підмереж/ключових слів через кому.
 * За замовчуванням довіряємо приватним мережам: YARP → haproxy ingress → под.
 */
function trustProxy(v: string | undefined): boolean | number | string[] {
  if (v === undefined || v === '') return ['loopback', 'linklocal', 'uniquelocal'];
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

const DEV_SECRET = 'dev-only-session-secret-change-me';

export const config = {
  isProd,
  port: num(env.PORT, 3000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orders',
  uploadsDir: path.resolve(env.UPLOADS_DIR ?? 'data/uploads'),
  maxUploadMb: num(env.MAX_UPLOAD_MB, 50),
  /** Каталог зібраного фронту (apps/web/dist), який Nest роздає в продакшені. */
  webDist: path.resolve(env.WEB_DIST ?? path.join(__dirname, '../../web/dist')),

  trustProxy: trustProxy(env.TRUST_PROXY),

  auth: {
    /** Ключ для HMAC ідентифікаторів сесій. У продакшені обов'язковий (див. assertConfig). */
    sessionSecret: env.SESSION_SECRET || DEV_SECRET,
    cookieName: env.SESSION_COOKIE ?? 'ot_sid',
    /** Cookie лише по HTTPS. За замовчуванням — у продакшені. */
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    /** Сесія закінчується, якщо нею не користувались стільки годин (ковзний строк). */
    idleHours: num(env.SESSION_IDLE_HOURS, 12),
    /** Абсолютний строк життя сесії, днів. */
    maxDays: num(env.SESSION_MAX_DAYS, 30),
    /** Скільки невдалих спроб поспіль до тимчасового блокування облікового запису. */
    maxFailedLogins: num(env.LOGIN_MAX_ATTEMPTS, 5),
    lockMinutes: num(env.LOGIN_LOCK_MINUTES, 15),
    /** Обмеження спроб входу з однієї IP за 15 хв (незалежно від логіна). */
    ipAttemptsPer15Min: num(env.LOGIN_IP_ATTEMPTS, 30),
    /** Перший адміністратор — створюється лише якщо в БД ще немає жодного користувача. */
    adminLogin: env.ADMIN_LOGIN ?? '',
    adminPassword: env.ADMIN_PASSWORD ?? '',
    adminName: env.ADMIN_NAME ?? 'Адміністратор',
    bcryptRounds: num(env.BCRYPT_ROUNDS, isProd ? 12 : 10),
  },
};

/** Перевірка конфігурації на старті: у продакшені без SESSION_SECRET не запускаємось. */
export function assertConfig() {
  if (config.isProd && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
    throw new Error('SESSION_SECRET is required in production (at least 32 characters). Add it to the k8s Secret purchase-secret.');
  }
}
