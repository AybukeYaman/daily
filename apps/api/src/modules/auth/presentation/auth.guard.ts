import { type CanActivate, createParamDecorator, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { UnauthorizedError } from '../../../core/domain/errors.js';
import { AccessTokenService } from '../application/ports.js';

interface AuthedRequest extends Request {
  userId?: string;
}

/** Requires `Authorization: Bearer <jwt>` and attaches the user id to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: AccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const userId = token ? await this.tokens.verify(token) : null;
    if (!userId) throw new UnauthorizedError('Authentication required');
    req.userId = userId;
    return true;
  }
}

/** The authenticated user's id. Only valid on routes protected by `AuthGuard`. */
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const userId = ctx.switchToHttp().getRequest<AuthedRequest>().userId;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
});
