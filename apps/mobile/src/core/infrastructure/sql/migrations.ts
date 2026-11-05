import type { SqlDatabase } from './sql-database';

export interface SqlCapabilities {
  /** Native builds of expo-sqlite ship FTS5; the web (wa-sqlite) build does not. */
  fts5: boolean;
}

/**
 * Local schema, versioned with PRAGMA user_version. Append-only: never edit a
 * shipped migration, add a new one. Each runs in one transaction with its
 * version bump. Statements are listed individually (triggers contain `;`).
 */
const MIGRATIONS: readonly ((caps: SqlCapabilities) => string[])[] = [
  // v1 — entries, outbox, key-value
  () => [
    `CREATE TABLE entries (
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
    )`,
    `CREATE INDEX entries_timeline ON entries (entry_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL`,
    // One row = "this entry has local changes to send". Payload is frozen on first attempt.
    `CREATE TABLE outbox (
      seq             INTEGER PRIMARY KEY AUTOINCREMENT,
      op_id           TEXT NOT NULL UNIQUE,
      entry_id        TEXT NOT NULL,
      payload         TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      failed          INTEGER NOT NULL DEFAULT 0,
      last_error      TEXT
    )`,
    `CREATE INDEX outbox_by_entry ON outbox (entry_id, seq)`,
    `CREATE TABLE kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`,
  ],

  // v2 — archive-aware timeline, trash, calendar, full-text search
  (caps) => [
    `DROP INDEX entries_timeline`,
    `CREATE INDEX entries_timeline ON entries (entry_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL AND archived = 0`,
    `CREATE INDEX entries_archive ON entries (entry_date DESC, created_at DESC, id DESC) WHERE deleted_at IS NULL AND archived = 1`,
    `CREATE INDEX entries_trash ON entries (deleted_at DESC) WHERE deleted_at IS NOT NULL`,
    // Set on restores: the server must snapshot the state being replaced.
    `ALTER TABLE outbox ADD COLUMN checkpoint INTEGER NOT NULL DEFAULT 0`,
    ...(caps.fts5
      ? [
          // External-content index: no second copy of the text. The app never runs VACUUM,
          // so rowids of `entries` stay stable (see ADR 0003).
          `CREATE VIRTUAL TABLE entries_fts USING fts5(
             title, plain_text, content='entries', content_rowid='rowid',
             tokenize='unicode61 remove_diacritics 2')`,
          `CREATE TRIGGER entries_fts_ai AFTER INSERT ON entries BEGIN
             INSERT INTO entries_fts (rowid, title, plain_text) VALUES (new.rowid, new.title, new.plain_text);
           END`,
          `CREATE TRIGGER entries_fts_ad AFTER DELETE ON entries BEGIN
             INSERT INTO entries_fts (entries_fts, rowid, title, plain_text) VALUES ('delete', old.rowid, old.title, old.plain_text);
           END`,
          `CREATE TRIGGER entries_fts_au AFTER UPDATE OF title, plain_text ON entries BEGIN
             INSERT INTO entries_fts (entries_fts, rowid, title, plain_text) VALUES ('delete', old.rowid, old.title, old.plain_text);
             INSERT INTO entries_fts (rowid, title, plain_text) VALUES (new.rowid, new.title, new.plain_text);
           END`,
          `INSERT INTO entries_fts (entries_fts) VALUES ('rebuild')`,
        ]
      : []),
  ],
];

async function detectCapabilities(db: SqlDatabase): Promise<SqlCapabilities> {
  const row = await db
    .get<{ fts5: number }>(`SELECT sqlite_compileoption_used('ENABLE_FTS5') AS fts5`)
    .catch(() => null);
  return { fts5: row?.fts5 === 1 };
}

export async function migrate(db: SqlDatabase): Promise<SqlCapabilities> {
  const caps = await detectCapabilities(db);
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const statements = MIGRATIONS[v]!(caps);
    await db.transaction(async (tx) => {
      for (const sql of statements) await tx.run(sql);
      await tx.run(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return caps;
}

/** Whether the FTS index exists (it may not on web, or if FTS5 became available later). */
export async function hasSearchIndex(db: SqlDatabase): Promise<boolean> {
  const row = await db.get<{ n: number }>(`SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'entries_fts'`);
  return row !== null;
}
