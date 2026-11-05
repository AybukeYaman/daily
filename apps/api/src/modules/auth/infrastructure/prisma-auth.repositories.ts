import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/infrastructure/prisma.service.js';
import type { RefreshTokenRecord } from '../domain/refresh-token.js';
import { RefreshTokenRepository, type UserCredentialsRecord, UserRepository } from '../application/ports.js';

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findByEmail(email: string): Promise<UserCredentialsRecord | null> {
    return this.prisma.db.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  }

  async create(email: string, passwordHash: string): Promise<{ id: string } | null> {
    try {
      return await this.prisma.db.user.create({ data: { email, passwordHash }, select: { id: true } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null;
      throw e;
    }
  }
}

@Injectable()
export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.prisma.db.refreshToken.create({ data: input });
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.db.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, familyId: true, expiresAt: true, usedAt: true, revokedAt: true },
    });
  }

  async markUsed(id: string, at: Date): Promise<boolean> {
    // Conditional update = atomic compare-and-set; two concurrent refreshes cannot both win.
    const { count } = await this.prisma.db.refreshToken.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { usedAt: at },
    });
    return count === 1;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } });
  }
}
