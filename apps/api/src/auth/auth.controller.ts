import { Body, Controller, Get, HttpCode, Logger, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import type { CurrentUser } from '@order-tracking/shared';
import { config } from '../config';
import { Audit } from '../audit/audit.decorator';
import { LoginDto } from './dto';
import { LoginThrottle } from './login-throttle';
import { Public } from './public.decorator';
import { createSession, safeEqual, SESSION_COOKIE } from './session';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: config.auth.cookieSecure,
  path: '/',
};

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly throttle = new LoginThrottle();

  @Public()
  @Post('login')
  @HttpCode(200)
  @Audit('auth.login')
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): CurrentUser {
    const ip = req.ip ?? 'unknown';
    this.throttle.check(ip);
    // Обидва порівняння виконуються завжди — час відповіді не підказує, що саме невірне.
    const userOk = safeEqual(dto.username.trim(), config.auth.username);
    const passOk = safeEqual(dto.password, config.auth.password);
    if (!userOk || !passOk) {
      this.throttle.fail(ip);
      this.logger.warn({ username: dto.username, ip }, 'Невдала спроба входу');
      throw new UnauthorizedException('Невірний логін або пароль');
    }
    this.throttle.reset(ip);
    const { token, session } = createSession(config.auth.username);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: new Date(session.exp) });
    req.user = { username: session.username };
    this.logger.log({ username: session.username, ip }, 'Користувач увійшов');
    return { username: session.username };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @Audit('auth.logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    if (req.user) this.logger.log({ username: req.user.username }, 'Користувач вийшов');
  }

  @Get('me')
  @Audit(false)
  me(@Req() req: Request): CurrentUser {
    return { username: req.user!.username };
  }
}
