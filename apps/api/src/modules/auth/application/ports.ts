import type { RefreshTokenRecord } from '../domain/refresh-token.js';

export interface UserCredentialsRecord {
  id: string;
  email: string;
  passwordHash: string;
}

export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<UserCredentialsRecord | null>;
  /** Returns null when the email is already taken (unique constraint), never throws for that case. */
  abstract create(email: string, passwordHash: string): Promise<{ id: string } | null>;
}

export abstract class RefreshTokenRepository {
  abstract create(input: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  abstract findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Atomically marks the token used. Returns false if another request already used it. */
  abstract markUsed(id: string, at: Date): Promise<boolean>;
  abstract revokeFamily(familyId: string, at: Date): Promise<void>;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(hash: string, password: string): Promise<boolean>;
}

export abstract class AccessTokenService {
  abstract issue(userId: string): Promise<{ token: string; expiresAt: Date }>;
  /** Returns the user id for a valid token, otherwise null. */
  abstract verify(token: string): Promise<string | null>;
}

export abstract class OpaqueTokenFactory {
  /** Cryptographically random, URL-safe token. */
  abstract generate(): string;
  /** Deterministic one-way hash used for storage and lookup. */
  abstract hash(token: string): string;
  abstract newId(): string;
}
