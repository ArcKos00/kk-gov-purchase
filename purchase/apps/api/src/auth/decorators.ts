import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../database/entities';

export interface AuthUser {
  id: number;
  login: string;
  fullName: string;
  role: Role;
  sessionId: string;
}

export type AuthRequest = Request & { user?: AuthUser };

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';
export const ALL_ROLES: Role[] = ['admin', 'editor', 'viewer'];
export const WRITE_ROLES: Role[] = ['admin', 'editor'];

/** Маршрут без автентифікації (вхід, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Хто має доступ. Без декоратора діє політика за замовчуванням (RolesGuard):
 * читання (GET/HEAD) — будь-яка роль, зміни — admin та editor.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Будь-який автентифікований користувач, навіть для POST/PUT (вихід, зміна власного пароля). */
export const AnyRole = () => Roles(...ALL_ROLES);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest<AuthRequest>().user!);
