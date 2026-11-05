import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import {
  ConcurrentModificationError,
  DomainError,
  EmailTakenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../domain/errors.js';

function statusOf(error: DomainError): number {
  if (error instanceof ValidationError) return HttpStatus.BAD_REQUEST;
  if (error instanceof UnauthorizedError) return HttpStatus.UNAUTHORIZED;
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof EmailTakenError) return HttpStatus.CONFLICT;
  if (error instanceof ConcurrentModificationError) return HttpStatus.CONFLICT;
  return HttpStatus.UNPROCESSABLE_ENTITY;
}

/**
 * Single place that turns errors into HTTP responses.
 * Never echoes request bodies or internals; unknown errors are logged without payloads.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const body: Record<string, unknown> = { error: exception.code, message: exception.message };
      if (exception instanceof ValidationError && exception.issues) body.issues = exception.issues;
      res.status(statusOf(exception)).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({ error: status === 429 ? 'rate_limited' : 'http_error', message: exception.message });
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`${err.name}: ${err.message}`, err.stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'internal', message: 'Something went wrong' });
  }
}
