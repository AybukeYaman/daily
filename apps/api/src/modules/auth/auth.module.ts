import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../core/infrastructure/config.js';
import { LoginUseCase, LogoutUseCase, RefreshSessionUseCase, RegisterUseCase } from './application/auth.use-cases.js';
import {
  AccessTokenService,
  OpaqueTokenFactory,
  PasswordHasher,
  RefreshTokenRepository,
  UserRepository,
} from './application/ports.js';
import { SessionIssuer } from './application/session-issuer.js';
import { Argon2PasswordHasher, JwtAccessTokenService, NodeOpaqueTokenFactory } from './infrastructure/crypto-adapters.js';
import { PrismaRefreshTokenRepository, PrismaUserRepository } from './infrastructure/prisma-auth.repositories.js';
import { AuthController } from './presentation/auth.controller.js';
import { AuthGuard } from './presentation/auth.guard.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ secret: config.jwtSecret }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: RefreshTokenRepository, useClass: PrismaRefreshTokenRepository },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: AccessTokenService, useClass: JwtAccessTokenService },
    { provide: OpaqueTokenFactory, useClass: NodeOpaqueTokenFactory },
    SessionIssuer,
    RegisterUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    AuthGuard,
  ],
  exports: [AuthGuard, AccessTokenService],
})
export class AuthModule {}
