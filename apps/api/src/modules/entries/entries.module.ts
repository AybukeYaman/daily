import { Module } from '@nestjs/common';
import { EntryRepository, EntryVersionRepository } from './application/ports.js';
import { PrismaEntryRepository, PrismaEntryVersionRepository } from './infrastructure/prisma-entry.repositories.js';

/**
 * Journal entry domain and persistence. Writes reach it only through the sync
 * module, so there is exactly one write path (idempotent, revision-checked).
 */
@Module({
  providers: [
    { provide: EntryRepository, useClass: PrismaEntryRepository },
    { provide: EntryVersionRepository, useClass: PrismaEntryVersionRepository },
  ],
  exports: [EntryRepository, EntryVersionRepository],
})
export class EntriesModule {}
