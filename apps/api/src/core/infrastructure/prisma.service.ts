import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import { AppConfig } from './config.js';

export type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;
  /** Holds the interactive transaction client for the current async call chain. */
  readonly txStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(config: AppConfig) {
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  /** The active transaction client if inside `TransactionRunner.run`, otherwise the root client. */
  get db(): Db {
    return this.txStorage.getStore() ?? this.client;
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
