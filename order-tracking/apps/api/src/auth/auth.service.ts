import {
  HttpException, HttpStatus, Injectable, Logger, OnApplicationBootstrap, UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Me } from '@order-tracking/shared';
import { config } from '../config';
import { User } from '../database/entities';
import { fail } from '../common/validation';
import { currentContext } from '../common/request-context';
import { AuditService } from '../audit/audit.service';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import { SessionService } from './session.service';
import { LoginThrottle } from './login-throttle';
import type { AuthUser } from './decorators';

export const toMe = (u: Pick<User, 'id' | 'login' | 'fullName' | 'role'>): Me =>
  ({ id: u.id, login: u.login, fullName: u.fullName, role: u.role });

const INVALID = 'Невірний логін або пароль';

const minutesWord = (n: number) => {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'хвилину';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'хвилини';
  return 'хвилин';
};

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly log = new Logger('Auth');

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottle,
    private readonly audit: AuditService,
  ) {}

  /** Перший адміністратор з ADMIN_LOGIN / ADMIN_PASSWORD — лише якщо користувачів ще немає. */
  async onApplicationBootstrap() {
    const users = this.ds.getRepository(User);
    if (await users.exists()) return;
    const { adminLogin, adminPassword, adminName } = config.auth;
    if (!adminLogin || !adminPassword) {
      this.log.warn('No users yet: set ADMIN_LOGIN and ADMIN_PASSWORD to create the first administrator.');
      return;
    }
    await users.save(users.create({
      login: adminLogin.trim().toLowerCase(),
      fullName: adminName,
      role: 'admin',
      active: true,
      passwordHash: await hashPassword(adminPassword),
    }));
    this.log.log(`Created the first administrator "${adminLogin}".`);
  }

  private tooMany(seconds: number): never {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    throw new HttpException(
      { statusCode: 429, message: `Забагато невдалих спроб. Спробуйте через ${minutes} ${minutesWord(minutes)}.` },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  async login(loginRaw: string, password: string): Promise<{ token: string; me: Me }> {
    const ctx = currentContext();
    const ip = ctx?.ip ?? 'unknown';
    const login = loginRaw.trim().toLowerCase();

    const wait = this.throttle.retryAfter(ip);
    if (wait > 0) {
      await this.audit.record({ action: 'login_failed', login, details: { reason: 'ip_rate_limit' } });
      this.tooMany(wait);
    }

    const user = await this.ds.getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.login) = :login', { login })
      .getOne();

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      this.throttle.fail(ip);
      await this.audit.record({ action: 'login_failed', userId: user.id, login, details: { reason: 'locked' } });
      this.tooMany((user.lockedUntil.getTime() - Date.now()) / 1000);
    }

    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.active) {
      this.throttle.fail(ip);
      let locked = false;
      if (user && !ok) {
        const failed = user.failedLogins + 1;
        locked = failed >= config.auth.maxFailedLogins;
        await this.ds.getRepository(User).update({ id: user.id }, {
          failedLogins: locked ? 0 : failed,
          lockedUntil: locked ? new Date(Date.now() + config.auth.lockMinutes * 60_000) : null,
        });
      }
      const reason = !user ? 'unknown_login' : !ok ? (locked ? 'bad_password_locked' : 'bad_password') : 'inactive';
      await this.audit.record({ action: 'login_failed', userId: user?.id ?? null, login, details: { reason } });
      if (locked) this.tooMany(config.auth.lockMinutes * 60);
      throw new UnauthorizedException(user && ok && !user.active ? 'Обліковий запис вимкнено. Зверніться до адміністратора.' : INVALID);
    }

    this.throttle.reset(ip);
    await this.ds.getRepository(User).update({ id: user.id }, { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() });
    const token = await this.sessions.create(user.id, ctx?.ip ?? null, ctx?.userAgent ?? null);
    await this.audit.record({ action: 'login', userId: user.id, login: user.login });
    return { token, me: toMe(user) };
  }

  async logout(user: AuthUser) {
    await this.sessions.revoke(user.sessionId);
    await this.audit.record({ action: 'logout', userId: user.id, login: user.login });
  }

  async changePassword(user: AuthUser, current: string, next: string) {
    const found = await this.ds.getRepository(User)
      .createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id: user.id }).getOne();
    if (!found || !(await verifyPassword(current, found.passwordHash))) fail({ currentPassword: 'Невірний поточний пароль' });
    if (current === next) fail({ newPassword: 'Новий пароль має відрізнятися від поточного' });
    const passwordHash = await hashPassword(next);
    await this.ds.transaction((em) => em.update(User, { id: user.id }, { passwordHash, passwordChangedAt: new Date() }));
    // Інші сесії (інші пристрої) — відкликаємо.
    await this.sessions.revokeAll(user.id, user.sessionId);
  }
}
