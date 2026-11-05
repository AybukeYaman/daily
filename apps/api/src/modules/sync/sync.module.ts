import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { EntriesModule } from '../entries/entries.module.js';
import { SyncOperationLog, UserSyncSequence } from './application/ports.js';
import { PullChangesUseCase } from './application/pull-changes.use-case.js';
import { PushChangesUseCase } from './application/push-changes.use-case.js';
import { PrismaSyncOperationLog, PrismaUserSyncSequence } from './infrastructure/prisma-sync.repositories.js';
import { SyncController } from './presentation/sync.controller.js';

@Module({
  imports: [AuthModule, EntriesModule],
  controllers: [SyncController],
  providers: [
    { provide: SyncOperationLog, useClass: PrismaSyncOperationLog },
    { provide: UserSyncSequence, useClass: PrismaUserSyncSequence },
    PushChangesUseCase,
    PullChangesUseCase,
  ],
})
export class SyncModule {}
