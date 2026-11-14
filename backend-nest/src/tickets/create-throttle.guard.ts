import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { ApiError } from '../common/http/api-error';
import { SlidingWindowLimiter } from '../common/rate-limit';

/**
 * Throttles the public POST /tickets per client IP. Guards run before
 * interceptors, so a throttled request is refused before its upload is parsed.
 * Behind the cPanel proxy every employee shares one IP: keep the budget generous
 * (TICKET_CREATE_MAX_PER_IP, default 60 per 10 minutes).
 */
@Injectable()
export class TicketCreateThrottle implements CanActivate {
  private readonly limiter: SlidingWindowLimiter;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.limiter = new SlidingWindowLimiter(config.ticketCreateMaxPerIp, config.ticketCreateWindowMs);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!this.limiter.tryConsume(req.ip || req.socket.remoteAddress || 'unknown')) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'Muitos chamados enviados em pouco tempo. Aguarde alguns minutos e tente novamente.');
    }
    return true;
  }
}
