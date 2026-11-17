import {
  Controller, Get, Header, HttpCode, type OnModuleInit, Post, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { acceptClientEvents, policyResponse, writeSecurityEvent } from '@k2/security/server';
import { currentUser } from '../audit/audit-context';
import { Public } from '../auth/auth.guard';
import type { SessionRequest } from '../auth/session';
import { securityEventContext, securityPolicyFor, securityStartupEvents } from './security';

/**
 * Два маршрути безпекового шаблону К-2 (`@k2/security`, security.ts) — поза префіксом `/api` (setup.ts), як і
 * в інших застосунках К-2.
 *
 * Події — один рядок ECS JSON на подію в stdout (`writeSecurityEvent`, рядок починається з `{"@timestamp"`), повз
 * pino: logger застосунку їх не обгортає. Звідти — Filebeat → SIEM (`event.dataset: k2.security`).
 */
@Public()
@Controller('k2-security')
export class SecurityController implements OnModuleInit {
  /** Перемикач середовища — теж слід: на старті по запису на кожен. */
  onModuleInit(): void {
    for (const e of securityStartupEvents()) writeSecurityEvent(e);
  }

  /**
   * Політика для цієї людини: хто на знаку, чи заборонено друк. Без входу (сторінка входу, анонімний перегляд) —
   * усе ввімкнено, знак з назвою застосунку. `no-store, private` — проксі, Cloudflare і диск браузера її не
   * кешують (інакше на спільному ПК знак показав би попередню людину).
   */
  @Get('policy')
  policy(@Req() req: SessionRequest, @Res() res: Response): void {
    const answer = policyResponse(securityPolicyFor(currentUser(req)));
    res.status(answer.status).set(answer.headers).send(answer.body);
  }

  /**
   * Події з браузера: спроба друку, підробка знака, політика не прочиталась. 403 / 401 / 413 / 400 віддає брама
   * `securityEventsGate` (setup.ts) ще до парсерів Nest; тут — лише відомі дії, ≤ 20 за запит
   * (`acceptClientEvents`), і 204 навіть якщо жодної не прийнято.
   */
  @Post('events')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store, private')
  events(@Req() req: SessionRequest): void {
    const user = currentUser(req);
    if (!user) throw new UnauthorizedException('Потрібно увійти');
    for (const e of acceptClientEvents(req.body, securityEventContext(req, user))) writeSecurityEvent(e);
  }
}
