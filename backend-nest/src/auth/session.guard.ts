import { CanActivate, createParamDecorator, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, SESSION_COOKIE, type Technician } from './auth.service';

export type AuthenticatedRequest = Request & { technician?: Technician; sessionToken?: string };

/** Protects technician-only routes with the server-side session. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    req.technician = await this.auth.authenticate(token);
    req.sessionToken = token as string;
    return true;
  }
}

export const CurrentTechnician = createParamDecorator((_data: unknown, context: ExecutionContext): Technician => {
  const technician = context.switchToHttp().getRequest<AuthenticatedRequest>().technician;
  if (!technician) throw new Error('SessionGuard must run before @CurrentTechnician');
  return technician;
});
