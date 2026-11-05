/**
 * Cross-cutting application ports. Abstract classes double as Nest DI tokens,
 * so use cases depend on these abstractions, never on Prisma or Node APIs.
 */
export abstract class TransactionRunner {
  /** Runs `work` in one database transaction. Repositories called inside join it automatically. */
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}

export abstract class Clock {
  abstract now(): Date;
}
