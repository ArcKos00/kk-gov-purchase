import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { config } from '../config';
import { currentContext } from '../common/request-context';
import type { Role } from '../database/entities';
import { ALL_ROLES, AuthRequest, IS_PUBLIC, ROLES, WRITE_ROLES } from './decorators';
import { SessionService } from './session.service';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Глобальний guard: кожен маршрут /api вимагає дійсну сесію (крім @Public()),
 * а далі — роль: явна з @Roles(...) або за замовчуванням (читати — усім, змінювати — admin/editor).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token: unknown = req.cookies?.[config.auth.cookieName];
    const resolved = typeof token === 'string' && token ? await this.sessions.resolve(token) : null;
    if (!resolved) throw new UnauthorizedException('Увійдіть, щоб продовжити');

    const { user, session } = resolved;
    req.user = { id: user.id, login: user.login, fullName: user.fullName, role: user.role, sessionId: session.id };
    const ctx = currentContext();
    if (ctx) {
      ctx.userId = user.id;
      ctx.login = user.login;
    }

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets)
      ?? (READ_METHODS.has(req.method) ? ALL_ROLES : WRITE_ROLES);
    if (!allowed.includes(user.role)) throw new ForbiddenException('Недостатньо прав для цієї дії');
    return true;
  }
}
