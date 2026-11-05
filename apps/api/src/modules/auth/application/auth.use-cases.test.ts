import { beforeEach, describe, expect, it } from 'vitest';
import { UnauthorizedError, EmailTakenError } from '../../../core/domain/errors.js';
import { AppConfig } from '../../../core/infrastructure/config.js';
import {
  CountingOpaqueTokens,
  DirectTransactionRunner,
  FakeAccessTokens,
  FixedClock,
  MemoryRefreshTokens,
  MemoryUsers,
  PlainHasher,
} from '../../../test/in-memory.js';
import { LoginUseCase, LogoutUseCase, RefreshSessionUseCase, RegisterUseCase } from './auth.use-cases.js';
import { SessionIssuer } from './session-issuer.js';

const creds = { email: 'buke@example.com', password: 'correct horse battery' };

describe('auth use cases', () => {
  let clock: FixedClock;
  let tokens: MemoryRefreshTokens;
  let register: RegisterUseCase;
  let login: LoginUseCase;
  let refresh: RefreshSessionUseCase;
  let logout: LogoutUseCase;

  beforeEach(() => {
    clock = new FixedClock();
    tokens = new MemoryRefreshTokens();
    const users = new MemoryUsers();
    const hasher = new PlainHasher();
    const opaque = new CountingOpaqueTokens();
    const tx = new DirectTransactionRunner();
    const config = new AppConfig({ DATABASE_URL: 'postgresql://x@localhost/x', JWT_SECRET: 's'.repeat(32) });
    const sessions = new SessionIssuer(new FakeAccessTokens(), tokens, opaque, clock, config);
    register = new RegisterUseCase(users, hasher, sessions, tx);
    login = new LoginUseCase(users, hasher, sessions);
    refresh = new RefreshSessionUseCase(tokens, opaque, sessions, clock, tx);
    logout = new LogoutUseCase(tokens, opaque, clock);
  });

  it('registers once per email', async () => {
    await register.execute(creds);
    await expect(register.execute(creds)).rejects.toBeInstanceOf(EmailTakenError);
  });

  it('rejects wrong password and unknown email with the same error', async () => {
    await register.execute(creds);
    await expect(login.execute({ ...creds, password: 'wrong password!' })).rejects.toThrow('Invalid email or password');
    await expect(login.execute({ ...creds, email: 'nobody@example.com' })).rejects.toThrow('Invalid email or password');
  });

  it('rotates refresh tokens', async () => {
    const s1 = await register.execute(creds);
    const s2 = await refresh.execute(s1.refreshToken);
    expect(s2.refreshToken).not.toBe(s1.refreshToken);
    await expect(refresh.execute(s2.refreshToken)).resolves.toBeDefined();
  });

  it('revokes the whole family when a used refresh token is replayed', async () => {
    const s1 = await register.execute(creds);
    const s2 = await refresh.execute(s1.refreshToken);
    await expect(refresh.execute(s1.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    // The attacker's replay also kills the legitimate descendant session.
    await expect(refresh.execute(s2.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('expires refresh tokens after 30 days', async () => {
    const s1 = await register.execute(creds);
    clock.advance(31 * 24 * 3600 * 1000);
    await expect(refresh.execute(s1.refreshToken)).rejects.toThrow('Session expired');
  });

  it('logout revokes the session', async () => {
    const s1 = await register.execute(creds);
    await logout.execute(s1.refreshToken);
    await expect(refresh.execute(s1.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(tokens.rows.every((t) => t.revokedAt)).toBe(true);
  });
});
