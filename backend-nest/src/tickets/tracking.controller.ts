import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EventsService } from './events.service';
import { sendImage } from './tickets.controller';
import { TicketsService } from './tickets.service';

/**
 * Public tracking for employees. The secret key travels only in the
 * X-Ticket-Key header (never in URLs or logs); the browser keeps it in the
 * URL fragment, which is never sent to servers.
 */
@Controller('tracking')
export class TrackingController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly events: EventsService,
  ) {}

  @Get(':protocol')
  async tracking(@Param('protocol') protocol: string, @Headers('x-ticket-key') key?: string) {
    return this.tickets.detail(await this.tickets.resolvePublic(protocol, key));
  }

  @Get(':protocol/attachment')
  async attachment(@Param('protocol') protocol: string, @Headers('x-ticket-key') key: string | undefined, @Res() res: Response) {
    sendImage(res, await this.tickets.attachment(await this.tickets.resolvePublic(protocol, key)));
  }

  @Get(':protocol/events')
  async stream(@Param('protocol') protocol: string, @Headers('x-ticket-key') key: string | undefined, @Res() res: Response) {
    const ticketId = await this.tickets.resolvePublic(protocol, key);
    this.events.subscribe(res, { ticketId });
  }
}
