import { Injectable } from '@nestjs/common';
import type { Session } from '@daily/shared';
import { Clock } from '../../../core/application/ports.js';
import { AppConfig } from '../../../core/infrastructure/config.js';
import { AccessTokenService, OpaqueTokenFactory, RefreshTokenRepository } from './ports.js';

/** Creates an access + refresh token pair. Shared by login, register and refresh. */
@Injectable()
export class SessionIssuer {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly opaque: OpaqueTokenFactory,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async issue(userId: string, familyId: string = this.opaque.newId()): Promise<Session> {
    const refreshToken = this.opaque.generate();
    const expiresAt = new Date(this.clock.now().getTime() + this.config.refreshTokenTtlSeconds * 1000);
    await this.refreshTokens.create({ userId, familyId, tokenHash: this.opaque.hash(refreshToken), expiresAt });
    const access = await this.accessTokens.issue(userId);
    return { accessToken: access.token, refreshToken, accessExpiresAt: access.expiresAt.toISOString() };
  }
}
