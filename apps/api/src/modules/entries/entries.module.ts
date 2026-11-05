import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EntryRepository, EntryVersionRepository } from './application/ports.js';
import { GetEntryVersionUseCase, ListEntryVersionsUseCase } from './application/version-history.use-cases.js';
import { PrismaEntryRepository, PrismaEntryVersionRepository } from './infrastructure/prisma-entry.repositories.js';
import { EntriesController } from './presentation/entries.controller.js';

/**
 * Journal entry domain, persistence and read-only history. Writes reach entries
 * only through the sync module, so there is exactly one write path
 * (idempotent, revision-checked).
 */
@Module({
  imports: [AuthModule],
  controllers: [EntriesController],
  providers: [
    { provide: EntryRepository, useClass: PrismaEntryRepository },
    { provide: EntryVersionRepository, useClass: PrismaEntryVersionRepository },
    ListEntryVersionsUseCase,
    GetEntryVersionUseCase,
  ],
  exports: [EntryRepository, EntryVersionRepository],
})
export class EntriesModule {}
