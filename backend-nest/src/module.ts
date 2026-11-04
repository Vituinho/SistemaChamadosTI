import { Module, Controller, Get, Post, Req, Res, UseGuards, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response } from 'express';
import { Database } from './db';
import { AuthRequest, AuthService, TechnicianGuard } from './auth';
import { TicketsController, TicketsService } from './tickets';
import { PushService } from './push';
import { catalog, departments } from './shared';

@Controller()
class RootController {
  constructor(private readonly db: Database, private readonly auth: AuthService, private readonly push: PushService) {}

  @Get('health')
  async health() {
    try { await this.db.query('SELECT 1'); } catch { throw new ServiceUnavailableException('Banco de dados indisponível'); }
    return { status: 'ok', system: 'Givova TI' };
  }
  @Get('catalog')
  catalog() { return catalog(); }
  @Get('departments')
  departments() { return departments; }
  @Post('auth/login')
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(req.body, req, res);
  }
  @Get('auth/me')
  @UseGuards(TechnicianGuard)
  me(@Req() req: AuthRequest) { return req.technician; }
  @Post('auth/logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }
  @Get('push/config')
  @UseGuards(TechnicianGuard)
  pushConfig() { return this.push.config(); }
  @Post('push/subscribe')
  @UseGuards(TechnicianGuard)
  subscribe(@Req() req: AuthRequest) { return this.push.subscribe(req.body, req.technician!.id); }
  @Post('push/unsubscribe')
  @UseGuards(TechnicianGuard)
  unsubscribe(@Req() req: AuthRequest) { return this.push.unsubscribe(req.body, req.technician!.id); }
  @Post('push/test')
  @UseGuards(TechnicianGuard)
  test(@Req() req: AuthRequest) { return this.push.test(req.technician!.id); }
}

@Module({
  controllers: [RootController, TicketsController],
  providers: [Database, AuthService, TechnicianGuard, TicketsService, PushService],
})
export class AppModule {}
