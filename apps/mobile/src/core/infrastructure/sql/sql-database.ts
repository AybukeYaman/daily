export type SqlValue = string | number | null;

/** Minimal SQL surface used by repositories. Implemented by expo-sqlite in the app and better-sqlite3 in tests. */
export interface SqlExecutor {
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export interface SqlDatabase extends SqlExecutor {
  exec(sql: string): Promise<void>;
  /** Runs `work` atomically. All writes must go through here; `tx` must be used for every statement inside. */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** FIFO async mutex: transactions never interleave and never hit SQLITE_BUSY. */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  lock<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
