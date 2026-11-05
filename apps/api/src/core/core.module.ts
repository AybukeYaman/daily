import { Global, Module } from '@nestjs/common';
import { Clock, TransactionRunner } from './application/ports.js';
import { AppConfig } from './infrastructure/config.js';
import { PrismaTransactionRunner } from './infrastructure/prisma-transaction-runner.js';
import { PrismaService } from './infrastructure/prisma.service.js';
import { SystemClock } from './infrastructure/system-clock.js';

@Global()
@Module({
  providers: [
    { provide: AppConfig, useFactory: () => new AppConfig(process.env) },
    PrismaService,
    { provide: TransactionRunner, useClass: PrismaTransactionRunner },
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [AppConfig, PrismaService, TransactionRunner, Clock],
})
export class CoreModule {}
