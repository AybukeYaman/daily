import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../application/ports.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaTransactionRunner extends TransactionRunner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    // Nested calls reuse the outer transaction instead of opening a second connection.
    if (this.prisma.txStorage.getStore()) return work();
    return this.prisma.client.$transaction((tx) => this.prisma.txStorage.run(tx, work), {
      maxWait: 5_000,
      timeout: 10_000,
    });
  }
}
