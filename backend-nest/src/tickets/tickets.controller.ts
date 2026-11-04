import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentTechnician, SessionGuard, type AuthenticatedRequest } from '../auth/session.guard';
import type { Technician } from '../auth/auth.service';
import { digest } from '../common/crypto';
import { validationFailed } from '../common/http/api-error';
import { parseId } from '../common/protocol';
import { AddNoteDto, CreateTicketDto, ListTicketsQuery, ResolveTicketDto, UpdateTicketDto } from './dto/ticket.dto';
import { EventsService } from './events.service';
import { TicketsService } from './tickets.service';
import { TicketUploadInterceptor } from './upload.interceptor';

function ticketId(raw: string): number {
  const id = parseId(raw);
  if (id === null) throw validationFailed(['id']);
  return id;
}

export function sendImage(res: Response, file: { mime: string; data: Buffer }) {
  res
    .status(200)
    .set({
      'Content-Type': file.mime,
      'Content-Disposition': 'inline; filename="anexo.webp"',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    })
    .send(file.data);
}

@Controller()
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly events: EventsService,
  ) {}

  /** Public: employees open tickets without logging in. */
  @Post('tickets')
  @HttpCode(201)
  @UseInterceptors(TicketUploadInterceptor)
  create(@Body() dto: CreateTicketDto, @Req() req: Request) {
    return this.tickets.create(dto, req.file?.buffer);
  }

  @Get('tickets')
  @UseGuards(SessionGuard)
  list(@Query() query: ListTicketsQuery, @CurrentTechnician() technician: Technician) {
    return this.tickets.list(query, technician);
  }

  @Get('tickets/:id')
  @UseGuards(SessionGuard)
  detail(@Param('id') id: string) {
    return this.tickets.detail(ticketId(id));
  }

  @Get('tickets/:id/history')
  @UseGuards(SessionGuard)
  async history(@Param('id') id: string) {
    return (await this.tickets.detail(ticketId(id))).history;
  }

  @Get('tickets/:id/attachment')
  @UseGuards(SessionGuard)
  async attachment(@Param('id') id: string, @Res() res: Response) {
    sendImage(res, await this.tickets.attachment(ticketId(id)));
  }

  @Post('tickets/:id/assign')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  assign(@Param('id') id: string, @CurrentTechnician() technician: Technician) {
    return this.tickets.assign(ticketId(id), technician);
  }

  @Patch('tickets/:id')
  @UseGuards(SessionGuard)
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto, @CurrentTechnician() technician: Technician) {
    return this.tickets.update(ticketId(id), dto, technician);
  }

  @Post('tickets/:id/resolve')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  resolve(@Param('id') id: string, @Body() dto: ResolveTicketDto, @CurrentTechnician() technician: Technician) {
    return this.tickets.resolve(ticketId(id), dto, technician);
  }

  @Post('tickets/:id/notes')
  @HttpCode(201)
  @UseGuards(SessionGuard)
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto, @CurrentTechnician() technician: Technician) {
    return this.tickets.addNote(ticketId(id), dto, technician);
  }

  @Post('tickets/:id/tracking-link')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  trackingLink(@Param('id') id: string, @CurrentTechnician() technician: Technician) {
    return this.tickets.regenerateTrackingKey(ticketId(id), technician);
  }

  @Get('events')
  @UseGuards(SessionGuard)
  stream(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    this.events.subscribe(res, { sessionHash: digest(req.sessionToken!) });
  }
}
