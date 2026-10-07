import crypto from 'node:crypto';
import { config } from '../config';

export const SESSION_COOKIE = 'purchase_session';

export interface Session {
  username: string;
  /** Час закінчення, мс від epoch */
  exp: number;
}

const sign = (payload: string) =>
  crypto.createHmac('sha256', config.auth.sessionSecret).update(payload).digest('base64url');

/** Токен сесії: base64url(JSON) + "." + HMAC-SHA256. Без сховища на сервері. */
export function createSession(username: string): { token: string; session: Session } {
  const session: Session = { username, exp: Date.now() + config.auth.sessionTtlHours * 3600_000 };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, session };
}

export function verifySession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac || !safeEqual(mac, sign(payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    return typeof s.username === 'string' && typeof s.exp === 'number' && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Порівняння за сталий час (через хеші — щоб не розкривати й довжину). */
export function safeEqual(a: string, b: string) {
  const h = (s: string) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}
