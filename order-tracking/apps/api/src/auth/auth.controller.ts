import { Body, Controller, Get, HttpCode, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Me } from '@order-tracking/shared';
import { AnyRole, AuthUser, CurrentUser, Public } from './decorators';
import { AuthService, toMe } from './auth.service';
import { SessionService } from './session.service';
import { ChangePasswordDto, LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<Me> {
    const { token, me } = await this.auth.login(dto.login, dto.password);
    this.sessions.setCookie(res, token);
    return me;
  }

  @AnyRole()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user);
    this.sessions.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Me {
    return toMe(user);
  }

  @AnyRole()
  @Put('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }
}
