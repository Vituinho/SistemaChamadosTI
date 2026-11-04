import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { Technician } from '../auth/auth.service';
import { CurrentTechnician, SessionGuard } from '../auth/session.guard';
import { PushEndpointDto, PushSubscriptionDto } from './push.dto';
import { PushService } from './push.service';

@Controller('push')
@UseGuards(SessionGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  config() {
    return this.push.publicConfig();
  }

  @Post('subscribe')
  @HttpCode(200)
  subscribe(@Body() dto: PushSubscriptionDto, @CurrentTechnician() technician: Technician) {
    return this.push.subscribe(dto, technician.id);
  }

  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@Body() dto: PushEndpointDto, @CurrentTechnician() technician: Technician) {
    return this.push.unsubscribe(dto.endpoint, technician.id);
  }

  @Post('test')
  @HttpCode(200)
  test(@CurrentTechnician() technician: Technician) {
    return this.push.sendTest(technician.id);
  }
}
