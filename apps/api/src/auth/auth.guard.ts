import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { IS_PUBLIC } from './public.decorator';
import { SESSION_COOKIE, verifySession } from './session';

/** Глобальний guard: усе під /api вимагає дійсної cookie сесії, крім @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly logger: PinoLogger,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const session = verifySession(req.cookies?.[SESSION_COOKIE]);
    if (session) {
      req.user = { username: session.username };
      // Усі подальші логи цього запиту — з іменем користувача.
      this.logger.assign({ user: session.username });
    }
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    if (!session) throw new UnauthorizedException('Потрібно увійти');
    return true;
  }
}
