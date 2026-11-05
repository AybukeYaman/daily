/** What the idempotency log keeps per op: the outcome only, never entry content. */
export type StoredOutcome =
  | { status: 'applied'; revision: number; syncSeq: number }
  | { status: 'conflict' }
  | { status: 'rejected'; reason: string };

export abstract class SyncOperationLog {
  abstract find(userId: string, opId: string): Promise<StoredOutcome | null>;
  abstract record(userId: string, opId: string, entryId: string, outcome: StoredOutcome): Promise<void>;
}

export abstract class UserSyncSequence {
  /**
   * Atomically increments and returns the user's change counter.
   * Called first in every write transaction: the row lock serializes all
   * writes of one user, which makes revision checks race-free.
   */
  abstract next(userId: string): Promise<number>;
}
