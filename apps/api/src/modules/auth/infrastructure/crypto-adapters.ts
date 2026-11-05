import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { Clock } from '../../../core/application/ports.js';
import { AppConfig } from '../../../core/infrastructure/config.js';
import { AccessTokenService, OpaqueTokenFactory, PasswordHasher } from '../application/ports.js';

/** Argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1). */
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  private static readonly options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

  hash(password: string): Promise<string> {
    return hash(password, Argon2PasswordHasher.options);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}

@Injectable()
export class JwtAccessTokenService extends AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const ttl = this.config.accessTokenTtlSeconds;
    const token = await this.jwt.signAsync({ sub: userId }, { expiresIn: ttl, algorithm: 'HS256' });
    return { token, expiresAt: new Date(this.clock.now().getTime() + ttl * 1000) };
  }

  async verify(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token, { algorithms: ['HS256'] });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}

@Injectable()
export class NodeOpaqueTokenFactory extends OpaqueTokenFactory {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  newId(): string {
    return randomUUID();
  }
}
