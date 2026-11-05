import { Injectable } from '@nestjs/common';
import type { EntryContent } from '@daily/shared';
import type { JournalEntry, JournalVersion, Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/infrastructure/prisma.service.js';
import type { EntryState } from '../domain/journal-entry.js';
import { EntryRepository, EntryVersionRepository, type EntryWrite, type VersionRecord } from '../application/ports.js';

/** `@db.Date` columns travel as UTC midnight; the domain uses plain `YYYY-MM-DD`. */
const toDbDate = (isoDate: string): Date => new Date(`${isoDate}T00:00:00.000Z`);
const fromDbDate = (d: Date): string => d.toISOString().slice(0, 10);

function toState(row: JournalEntry): EntryState {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    // Written only through validated EntryContent, so the cast is safe.
    content: row.content as unknown as EntryContent,
    plainText: row.plainText,
    wordCount: row.wordCount,
    entryDate: fromDbDate(row.entryDate),
    favorite: row.favorite,
    archived: row.archived,
    conflictOf: row.conflictOf,
    revision: row.revision,
    syncSeq: row.syncSeq,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toColumns(e: EntryWrite) {
  return {
    title: e.title,
    content: e.content as unknown as Prisma.InputJsonValue,
    plainText: e.plainText,
    wordCount: e.wordCount,
    entryDate: toDbDate(e.entryDate),
    favorite: e.favorite,
    archived: e.archived,
    conflictOf: e.conflictOf,
    revision: e.revision,
    syncSeq: e.syncSeq,
    deletedAt: e.deletedAt,
  };
}

@Injectable()
export class PrismaEntryRepository extends EntryRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<EntryState | null> {
    const row = await this.prisma.db.journalEntry.findUnique({ where: { id } });
    return row ? toState(row) : null;
  }

  async insert(entry: EntryWrite): Promise<EntryState> {
    const row = await this.prisma.db.journalEntry.create({
      data: { id: entry.id, userId: entry.userId, ...toColumns(entry) },
    });
    return toState(row);
  }

  async update(entry: EntryWrite, expectedRevision: number): Promise<EntryState | null> {
    const { count } = await this.prisma.db.journalEntry.updateMany({
      where: { id: entry.id, userId: entry.userId, revision: expectedRevision },
      data: toColumns(entry),
    });
    return count === 1 ? this.findById(entry.id) : null;
  }

  async listChangedSince(userId: string, sinceSeq: number, limit: number): Promise<EntryState[]> {
    const rows = await this.prisma.db.journalEntry.findMany({
      where: { userId, syncSeq: { gt: sinceSeq } },
      orderBy: { syncSeq: 'asc' },
      take: limit,
    });
    return rows.map(toState);
  }
}

@Injectable()
export class PrismaEntryVersionRepository extends EntryVersionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async snapshot(entry: EntryState): Promise<void> {
    await this.prisma.db.journalVersion.create({
      data: {
        entryId: entry.id,
        userId: entry.userId,
        revision: entry.revision,
        title: entry.title,
        content: entry.content as unknown as Prisma.InputJsonValue,
        entryDate: toDbDate(entry.entryDate),
        deletedAt: entry.deletedAt,
      },
    });
  }

  async lastSnapshotAt(entryId: string): Promise<Date | null> {
    const row = await this.prisma.db.journalVersion.findFirst({
      where: { entryId },
      orderBy: { revision: 'desc' }, // revision is monotonic; uses the (entry_id, revision) unique index
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  async prune(entryId: string, keep: number): Promise<void> {
    const boundary = await this.prisma.db.journalVersion.findFirst({
      where: { entryId },
      orderBy: { revision: 'desc' },
      skip: keep - 1,
      select: { revision: true },
    });
    if (boundary) await this.prisma.db.journalVersion.deleteMany({ where: { entryId, revision: { lt: boundary.revision } } });
  }

  async list(userId: string, entryId: string, limit: number): Promise<VersionRecord[]> {
    const rows = await this.prisma.db.journalVersion.findMany({
      where: { entryId, userId },
      orderBy: { revision: 'desc' },
      take: limit,
    });
    return rows.map(toVersion);
  }

  async get(userId: string, entryId: string, revision: number): Promise<VersionRecord | null> {
    const row = await this.prisma.db.journalVersion.findFirst({ where: { entryId, userId, revision } });
    return row ? toVersion(row) : null;
  }
}

function toVersion(row: JournalVersion): VersionRecord {
  return {
    revision: row.revision,
    title: row.title,
    content: row.content as unknown as EntryContent,
    entryDate: fromDbDate(row.entryDate),
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
  };
}
