import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { UserInfo } from '@order-tracking/shared';
import { User } from '../database/entities';
import { fail } from '../common/validation';
import { hashPassword } from '../auth/password';
import { SessionService } from '../auth/session.service';
import type { AuthUser } from '../auth/decorators';
import { PasswordResetDto, UserCreateDto, UserUpdateDto } from '../auth/dto';

export const toUserInfo = (u: User): UserInfo => ({
  id: u.id,
  login: u.login,
  fullName: u.fullName,
  role: u.role,
  active: u.active,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  lockedUntil: u.lockedUntil && u.lockedUntil.getTime() > Date.now() ? u.lockedUntil.toISOString() : null,
});

/** Керування користувачами (лише адміністратор). Усі зміни — у транзакції, тож потрапляють у журнал. */
@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly sessions: SessionService,
  ) {}

  async list(): Promise<UserInfo[]> {
    const users = await this.ds.getRepository(User).find({ order: { active: 'DESC', fullName: 'ASC' } });
    return users.map(toUserInfo);
  }

  private async find(em: EntityManager, id: number) {
    const u = await em.findOne(User, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!u) throw new NotFoundException('Користувача не знайдено');
    return u;
  }

  async create(dto: UserCreateDto): Promise<UserInfo> {
    const login = dto.login.trim().toLowerCase();
    const passwordHash = await hashPassword(dto.password);
    return this.ds.transaction(async (em) => {
      const exists = await em.createQueryBuilder(User, 'u').where('lower(u.login) = :login', { login }).getExists();
      if (exists) fail({ login: 'Такий логін уже існує' });
      const u = await em.save(User, em.create(User, {
        login, fullName: dto.fullName.trim(), role: dto.role, active: true, passwordHash,
      }));
      return toUserInfo(u);
    });
  }

  /** Не можна лишити систему без активного адміністратора (зокрема, позбавити прав себе). */
  private async assertAdminRemains(em: EntityManager, u: User, dto: UserUpdateDto) {
    const losesAdmin = u.role === 'admin' && u.active && ((dto.role && dto.role !== 'admin') || dto.active === false);
    if (!losesAdmin) return;
    const admins = await em.count(User, { where: { role: 'admin', active: true } });
    if (admins <= 1) fail({ _: 'Має лишитися хоча б один активний адміністратор.' });
  }

  async update(id: number, dto: UserUpdateDto, actor: AuthUser): Promise<UserInfo> {
    const result = await this.ds.transaction(async (em) => {
      const u = await this.find(em, id);
      if (u.id === actor.id && (dto.active === false || (dto.role && dto.role !== u.role)))
        fail({ _: 'Не можна вимкнути себе або змінити собі роль.' });
      await this.assertAdminRemains(em, u, dto);
      if (dto.fullName !== undefined) u.fullName = dto.fullName.trim();
      if (dto.role !== undefined) u.role = dto.role;
      if (dto.active !== undefined) {
        u.active = dto.active;
        if (dto.active) {
          u.failedLogins = 0;
          u.lockedUntil = null;
        }
      }
      return toUserInfo(await em.save(u));
    });
    if (dto.active === false) await this.sessions.revokeAll(id);
    return result;
  }

  /** Новий пароль від адміністратора: знімає блокування і завершує всі сесії користувача. */
  async resetPassword(id: number, dto: PasswordResetDto): Promise<UserInfo> {
    const passwordHash = await hashPassword(dto.password);
    const result = await this.ds.transaction(async (em) => {
      const u = await this.find(em, id);
      await em.update(User, { id }, { passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null });
      return toUserInfo({ ...u, failedLogins: 0, lockedUntil: null });
    });
    await this.sessions.revokeAll(id);
    return result;
  }
}
