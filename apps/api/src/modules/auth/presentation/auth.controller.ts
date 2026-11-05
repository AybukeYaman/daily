import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type Credentials,
  CredentialsSchema,
  type RefreshRequest,
  RefreshRequestSchema,
  type Session,
} from '@daily/shared';
import { ZodPipe } from '../../../core/presentation/zod-validation.pipe.js';
import { LoginUseCase, LogoutUseCase, RefreshSessionUseCase, RegisterUseCase } from '../application/auth.use-cases.js';

/** Strict limit on credential endpoints: 10 requests per minute per client. */
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUseCase,
    private readonly loginUser: LoginUseCase,
    private readonly refreshSession: RefreshSessionUseCase,
    private readonly logoutUser: LogoutUseCase,
  ) {}

  @Post('register')
  register(@Body(new ZodPipe(CredentialsSchema)) body: Credentials): Promise<Session> {
    return this.registerUser.execute(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodPipe(CredentialsSchema)) body: Credentials): Promise<Session> {
    return this.loginUser.execute(body);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodPipe(RefreshRequestSchema)) body: RefreshRequest): Promise<Session> {
    return this.refreshSession.execute(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body(new ZodPipe(RefreshRequestSchema)) body: RefreshRequest): Promise<void> {
    return this.logoutUser.execute(body.refreshToken);
  }
}
