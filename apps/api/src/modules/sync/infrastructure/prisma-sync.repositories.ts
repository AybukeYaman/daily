import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/infrastructure/prisma.service.js';
import { type StoredOutcome, SyncOperationLog, UserSyncSequence } from '../application/ports.js';

@Injectable()
export class PrismaSyncOperationLog extends SyncOperationLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(userId: string, opId: string): Promise<StoredOutcome | null> {
    const row = await this.prisma.db.syncOperation.findUnique({
      where: { userId_opId: { userId, opId } },
      select: { result: true },
    });
    return row ? (row.result as unknown as StoredOutcome) : null;
  }

  async record(userId: string, opId: string, entryId: string, outcome: StoredOutcome): Promise<void> {
    await this.prisma.db.syncOperation.create({
      data: { userId, opId, entryId, status: outcome.status, result: outcome as unknown as Prisma.InputJsonValue },
    });
  }
}

@Injectable()
export class PrismaUserSyncSequence extends UserSyncSequence {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async next(userId: string): Promise<number> {
    const user = await this.prisma.db.user.update({
      where: { id: userId },
      data: { syncSeq: { increment: 1 } },
      select: { syncSeq: true },
    });
    return user.syncSeq;
  }
}
