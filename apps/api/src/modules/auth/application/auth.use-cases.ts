import { Injectable } from '@nestjs/common';
import type { Credentials, Session } from '@daily/shared';
import { Clock, TransactionRunner } from '../../../core/application/ports.js';
import { EmailTakenError, UnauthorizedError } from '../../../core/domain/errors.js';
import { refreshTokenState } from '../domain/refresh-token.js';
import { OpaqueTokenFactory, PasswordHasher, RefreshTokenRepository, UserRepository } from './ports.js';
import { SessionIssuer } from './session-issuer.js';

const INVALID_CREDENTIALS = 'Invalid email or password';

@Injectable()
export class RegisterUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
    private readonly tx: TransactionRunner,
  ) {}

  async execute(input: Credentials): Promise<Session> {
    const passwordHash = await this.hasher.hash(input.password); // slow work outside the transaction
    return this.tx.run(async () => {
      const user = await this.users.create(input.email, passwordHash);
      if (!user) throw new EmailTakenError();
      return this.sessions.issue(user.id);
    });
  }
}

@Injectable()
export class LoginUseCase {
  /** Lazily computed so unknown emails cost the same as wrong passwords (no user enumeration by timing). */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: Credentials): Promise<Session> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      this.dummyHash ??= this.hasher.hash('daily-timing-equalizer');
      await this.hasher.verify(await this.dummyHash, input.password);
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    if (!(await this.hasher.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    return this.sessions.issue(user.id);
  }
}

@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly opaque: OpaqueTokenFactory,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
    private readonly tx: TransactionRunner,
  ) {}

  async execute(refreshToken: string): Promise<Session> {
    const now = this.clock.now();
    const stored = await this.refreshTokens.findByHash(this.opaque.hash(refreshToken));
    if (!stored) throw new UnauthorizedError('Invalid session');

    const state = refreshTokenState(stored, now);
    if (state === 'reused') {
      // Token theft signal: kill every session descended from this login.
      await this.refreshTokens.revokeFamily(stored.familyId, now);
      throw new UnauthorizedError('Session revoked');
    }
    if (state !== 'valid') throw new UnauthorizedError('Session expired');

    const session = await this.tx.run(async () => {
      if (!(await this.refreshTokens.markUsed(stored.id, now))) return null; // lost a concurrent race
      return this.sessions.issue(stored.userId, stored.familyId);
    });
    if (!session) {
      await this.refreshTokens.revokeFamily(stored.familyId, now);
      throw new UnauthorizedError('Session revoked');
    }
    return session;
  }
}

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly opaque: OpaqueTokenFactory,
    private readonly clock: Clock,
  ) {}

  /** Idempotent: unknown tokens are ignored so logout always succeeds from the client's view. */
  async execute(refreshToken: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(this.opaque.hash(refreshToken));
    if (stored) await this.refreshTokens.revokeFamily(stored.familyId, this.clock.now());
  }
}
