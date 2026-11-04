import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AuthService, SESSION_COOKIE, type Technician } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentTechnician, SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.config.cookieSecure, sameSite: 'strict', path: '/' };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<Technician> {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const { technician, token } = await this.auth.login(dto.username, dto.password, ip, req.cookies?.[SESSION_COOKIE]);
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: this.auth.sessionMaxAgeMs });
    return technician;
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentTechnician() technician: Technician): Technician {
    return technician;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    return { ok: true };
  }
}
