import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { TicketCreateThrottle } from './create-throttle.guard';
import { EventsService } from './events.service';
import { ImageService } from './image.service';
import { TicketsController } from './tickets.controller';
import { TicketsRepository } from './tickets.repository';
import { TicketsService } from './tickets.service';
import { TrackingController } from './tracking.controller';

@Module({
  imports: [PushModule],
  controllers: [TicketsController, TrackingController],
  providers: [TicketsService, TicketsRepository, ImageService, EventsService, TicketCreateThrottle],
})
export class TicketsModule {}
