import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { LessThan, Repository } from 'typeorm';
import { config } from '../config';
import { Session, User } from '../database/entities';

const HOUR = 3600_000;
/** Як часто продовжувати ковзний строк сесії (щоб не писати в БД на кожен запит). */
const TOUCH_EVERY = 5 * 60_000;

/**
 * Серверні сесії в Postgres. У cookie — випадковий токен (256 біт), у БД — лише HMAC(SESSION_SECRET, токен).
 * Чому не JWT: сесію можна миттєво відкликати (вихід, деактивація, скидання пароля), немає
 * refresh-токенів і чорних списків; одна репліка й так ходить у БД на кожен запит.
 */
@Injectable()
export class SessionService {
  constructor(@InjectRepository(Session) private readonly sessions: Repository<Session>) {}

  private idOf(token: string) {
    return crypto.createHmac('sha256', config.auth.sessionSecret).update(token).digest('base64url');
  }

  private idleExpiry(from = Date.now()) {
    return new Date(from + config.auth.idleHours * HOUR);
  }

  async create(userId: number, ip: string | null, userAgent: string | null): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = new Date();
    await this.sessions.insert({
      id: this.idOf(token),
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: this.idleExpiry(now.getTime()),
      ip,
      userAgent,
    });
    // Заодно прибираємо прострочені.
    void this.sessions.delete({ expiresAt: LessThan(now) }).catch(() => undefined);
    return token;
  }

  /** Сесія за токеном з cookie разом з активним користувачем; null — недійсна/прострочена. */
  async resolve(token: string): Promise<{ session: Session; user: User } | null> {
    const id = this.idOf(token);
    const session = await this.sessions.findOne({ where: { id }, relations: { user: true } });
    if (!session) return null;
    const now = Date.now();
    const absolute = session.createdAt.getTime() + config.auth.maxDays * 24 * HOUR;
    if (session.expiresAt.getTime() <= now || absolute <= now || !session.user.active) {
      await this.sessions.delete({ id });
      return null;
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_EVERY) {
      await this.sessions.update({ id }, { lastSeenAt: new Date(now), expiresAt: this.idleExpiry(now) });
    }
    return { session, user: session.user };
  }

  revoke(sessionId: string) {
    return this.sessions.delete({ id: sessionId });
  }

  /** Відкликає всі сесії користувача (крім, можливо, поточної). */
  async revokeAll(userId: number, exceptSessionId?: string) {
    const qb = this.sessions.createQueryBuilder().delete().where('user_id = :userId', { userId });
    if (exceptSessionId) qb.andWhere('id <> :id', { id: exceptSessionId });
    await qb.execute();
  }

  setCookie(res: Response, token: string) {
    res.cookie(config.auth.cookieName, token, {
      httpOnly: true,
      secure: config.auth.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: config.auth.maxDays * 24 * HOUR,
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(config.auth.cookieName, { httpOnly: true, secure: config.auth.cookieSecure, sameSite: 'lax', path: '/' });
  }
}
