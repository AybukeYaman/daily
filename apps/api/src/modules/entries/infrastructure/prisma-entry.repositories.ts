import { Injectable } from '@nestjs/common';
import type { EntryContent } from '@daily/shared';
import type { JournalEntry, Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/infrastructure/prisma.service.js';
import type { EntryState } from '../domain/journal-entry.js';
import { EntryRepository, EntryVersionRepository, type EntryWrite } from '../application/ports.js';

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
}
