import { backoffMs, type EntryDto, type OpResult, type PushOp, resolveConflict } from '@daily/shared';
import type { Clock, IdGenerator, SyncStore } from '../application/ports';
import type { SqlDatabase, SqlExecutor } from './sql/sql-database';
import { derivedColumns, entryDataOf, type EntryRow, insertEntry, markDirty, rowToEntry } from './sqlite-entry-store';

interface OutboxRow {
  seq: number;
  op_id: string;
  entry_id: string;
  payload: string | null;
  attempts: number;
}

const CURSOR_KEY = 'sync.cursor';

/** Writes the server's version of an entry locally, marking it as acknowledged at that revision. */
async function writeServerEntry(tx: SqlExecutor, e: EntryDto): Promise<void> {
  const d = derivedColumns(e);
  await tx.run(
    `INSERT INTO entries (id, title, content, plain_text, preview, word_count, entry_date, favorite, archived,
       conflict_of, server_revision, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       title = excluded.title, content = excluded.content, plain_text = excluded.plain_text,
       preview = excluded.preview, word_count = excluded.word_count, entry_date = excluded.entry_date,
       favorite = excluded.favorite, archived = excluded.archived, conflict_of = excluded.conflict_of,
       server_revision = excluded.server_revision, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
    [e.id, e.title, JSON.stringify(e.content), d.plainText, d.preview, d.wordCount, e.entryDate,
      e.favorite ? 1 : 0, e.archived ? 1 : 0, e.conflictOf, e.revision, e.deletedAt, e.createdAt, e.updatedAt],
  );
}

export class SqliteSyncStore implements SyncStore {
  constructor(
    private readonly db: SqlDatabase,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async claimBatch(nowMs: number, max: number): Promise<PushOp[]> {
    return this.db.transaction(async (tx) => {
      // Head of each entry's queue only: ops of one entry are strictly sequential.
      const heads = await tx.all<OutboxRow>(
        `SELECT o.seq, o.op_id, o.entry_id, o.payload, o.attempts FROM outbox o
         WHERE o.failed = 0 AND o.next_attempt_at <= ?
           AND o.seq = (SELECT MIN(seq) FROM outbox WHERE entry_id = o.entry_id)
         ORDER BY o.seq LIMIT ?`,
        [nowMs, max],
      );

      const ops: PushOp[] = [];
      for (const row of heads) {
        let op: PushOp | null = row.payload ? (JSON.parse(row.payload) as PushOp) : null;
        if (!op) {
          op = await this.buildOp(tx, row);
          if (!op) {
            await tx.run('DELETE FROM outbox WHERE seq = ?', [row.seq]);
            continue;
          }
        }
        // Freeze on first attempt: a retried opId must always carry the same payload.
        await tx.run('UPDATE outbox SET payload = ?, attempts = attempts + 1 WHERE seq = ?', [JSON.stringify(op), row.seq]);
        ops.push(op);
      }
      return ops;
    });
  }

  /** Builds the op from the entry's current local state. Returns null when there is nothing to send. */
  private async buildOp(tx: SqlExecutor, row: OutboxRow): Promise<PushOp | null> {
    const r = await tx.get<EntryRow>('SELECT * FROM entries WHERE id = ?', [row.entry_id]);
    if (!r) return null;
    const entry = rowToEntry(r);
    if (entry.deletedAt) {
      // Deleted before the server ever saw it: nothing to tell the server.
      if (entry.serverRevision === null) return null;
      return { kind: 'delete', opId: row.op_id, entryId: entry.id, baseRevision: entry.serverRevision };
    }
    return { kind: 'upsert', opId: row.op_id, entryId: entry.id, baseRevision: entry.serverRevision, data: entryDataOf(entry) };
  }

  async scheduleRetry(opIds: string[], nowMs: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const opId of opIds) {
        const row = await tx.get<{ attempts: number }>('SELECT attempts FROM outbox WHERE op_id = ?', [opId]);
        if (row) await tx.run('UPDATE outbox SET next_attempt_at = ? WHERE op_id = ?', [nowMs + backoffMs(row.attempts), opId]);
      }
    });
  }

  async applyResults(results: OpResult[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const result of results) {
        const row = await tx.get<OutboxRow>('SELECT * FROM outbox WHERE op_id = ?', [result.opId]);
        if (!row) continue;

        if (result.status === 'applied') {
          await tx.run('UPDATE entries SET server_revision = ? WHERE id = ?', [result.revision, row.entry_id]);
          await tx.run('DELETE FROM outbox WHERE seq = ?', [row.seq]);
        } else if (result.status === 'rejected') {
          const wasDelete = row.payload !== null && (JSON.parse(row.payload) as PushOp).kind === 'delete';
          if (wasDelete && result.reason === 'not_found') {
            await tx.run('DELETE FROM outbox WHERE seq = ?', [row.seq]);
          } else {
            // Kept, never silently dropped: surfaced as "sync failed" until the user retries.
            await tx.run('UPDATE outbox SET failed = 1, last_error = ? WHERE seq = ?', [result.reason, row.seq]);
          }
        } else {
          await this.resolveConflict(tx, row.entry_id, result.entry);
        }
      }
    });
  }

  /** Lossless: server version keeps the id; differing local data becomes a new conflict-copy entry. */
  private async resolveConflict(tx: SqlExecutor, entryId: string, server: EntryDto): Promise<void> {
    const localRow = await tx.get<EntryRow>('SELECT * FROM entries WHERE id = ?', [entryId]);
    const local = localRow ? rowToEntry(localRow) : null;
    const resolution = resolveConflict(local && !local.deletedAt ? entryDataOf(local) : null, server);

    await writeServerEntry(tx, server);
    await tx.run('DELETE FROM outbox WHERE entry_id = ?', [entryId]);

    if (resolution.kind === 'adopt-server-keep-local-copy') {
      const copyId = this.ids.uuid();
      await insertEntry(tx, copyId, { ...resolution.copy, conflictOf: server.id }, this.clock.now().toISOString());
      await markDirty(tx, copyId, this.ids);
    }
  }

  async cursor(): Promise<number> {
    const row = await this.db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', [CURSOR_KEY]);
    return row ? Number(row.value) : 0;
  }

  async applyPulled(entries: EntryDto[], cursor: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const e of entries) {
        // Entries with unsent local changes are resolved by push, never overwritten by pull.
        const pending = await tx.get<{ n: number }>('SELECT 1 AS n FROM outbox WHERE entry_id = ? LIMIT 1', [e.id]);
        if (!pending) await writeServerEntry(tx, e);
      }
      await tx.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
        CURSOR_KEY,
        String(cursor),
      ]);
    });
  }

  async counts(): Promise<{ pending: number; failed: number }> {
    const row = await this.db.get<{ pending: number; failed: number }>(
      'SELECT COALESCE(SUM(failed = 0), 0) AS pending, COALESCE(SUM(failed = 1), 0) AS failed FROM outbox',
    );
    return { pending: row?.pending ?? 0, failed: row?.failed ?? 0 };
  }

  async nextDueAt(): Promise<number | null> {
    const row = await this.db.get<{ due: number | null }>('SELECT MIN(next_attempt_at) AS due FROM outbox WHERE failed = 0');
    return row?.due ?? null;
  }

  /** User-initiated retry of ops the server rejected. */
  async retryFailed(): Promise<void> {
    await this.db.run('UPDATE outbox SET failed = 0, next_attempt_at = 0 WHERE failed = 1');
  }
}
