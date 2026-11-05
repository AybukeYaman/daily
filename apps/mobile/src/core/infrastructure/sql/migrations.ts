import type { SqlDatabase } from './sql-database';

/**
 * Local schema, versioned with PRAGMA user_version. Append-only: never edit a
 * shipped migration, add a new one. Each runs in a transaction with its version bump.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE entries (
    id              TEXT PRIMARY KEY NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    plain_text      TEXT NOT NULL,
    preview         TEXT NOT NULL,
    word_count      INTEGER NOT NULL,
    entry_date      TEXT NOT NULL,
    favorite        INTEGER NOT NULL DEFAULT 0,
    archived        INTEGER NOT NULL DEFAULT 0,
    conflict_of     TEXT,
    server_revision INTEGER,
    deleted_at      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX entries_timeline ON entries (entry_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL;

  -- One row = "this entry has local changes to send". Payload is frozen on first attempt.
  CREATE TABLE outbox (
    seq             INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id           TEXT NOT NULL UNIQUE,
    entry_id        TEXT NOT NULL,
    payload         TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    failed          INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT
  );
  CREATE INDEX outbox_by_entry ON outbox (entry_id, seq);

  CREATE TABLE kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `,
];

export async function migrate(db: SqlDatabase): Promise<void> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const statements = MIGRATIONS[v]!.split(';').map((s) => s.trim()).filter(Boolean);
    await db.transaction(async (tx) => {
      for (const sql of statements) await tx.run(sql);
      await tx.run(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
