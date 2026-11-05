import { countWords, type EntryContent, type EntryData, previewOf, toPlainText } from '@daily/shared';
import type {
  Clock,
  EntryStore,
  EntrySummary,
  IdGenerator,
  LocalEntry,
  TimelineCursor,
  TimelinePage,
} from '../application/ports';
import type { SqlDatabase, SqlExecutor } from './sql/sql-database';

export interface EntryRow {
  id: string;
  title: string;
  content: string;
  word_count: number;
  entry_date: string;
  favorite: number;
  archived: number;
  conflict_of: string | null;
  server_revision: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToEntry(r: EntryRow): LocalEntry {
  return {
    id: r.id,
    title: r.title,
    content: JSON.parse(r.content) as EntryContent,
    entryDate: r.entry_date,
    favorite: r.favorite === 1,
    archived: r.archived === 1,
    conflictOf: r.conflict_of,
    wordCount: r.word_count,
    serverRevision: r.server_revision,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function entryDataOf(e: LocalEntry): EntryData {
  return {
    title: e.title,
    content: e.content,
    entryDate: e.entryDate,
    favorite: e.favorite,
    archived: e.archived,
    conflictOf: e.conflictOf,
  };
}

/** Columns derived from data, computed once per save instead of on every render. */
export function derivedColumns(data: EntryData) {
  const text = toPlainText(data.content);
  return { plainText: text, preview: previewOf(text), wordCount: countWords(text) };
}

/**
 * Marks an entry as needing sync. Coalesces: if the newest outbox row for the
 * entry has never been attempted, it already covers this change (its payload
 * is read lazily at send time). Otherwise a new row is appended.
 */
export async function markDirty(tx: SqlExecutor, entryId: string, ids: IdGenerator): Promise<void> {
  const latest = await tx.get<{ attempts: number }>(
    'SELECT attempts FROM outbox WHERE entry_id = ? ORDER BY seq DESC LIMIT 1',
    [entryId],
  );
  if (latest && latest.attempts === 0) return;
  await tx.run('INSERT INTO outbox (op_id, entry_id) VALUES (?, ?)', [ids.uuid(), entryId]);
}

export async function insertEntry(tx: SqlExecutor, id: string, data: EntryData, nowIso: string): Promise<void> {
  const d = derivedColumns(data);
  await tx.run(
    `INSERT INTO entries (id, title, content, plain_text, preview, word_count, entry_date, favorite, archived,
       conflict_of, server_revision, deleted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [id, data.title, JSON.stringify(data.content), d.plainText, d.preview, d.wordCount, data.entryDate,
      data.favorite ? 1 : 0, data.archived ? 1 : 0, data.conflictOf, nowIso, nowIso],
  );
}

const SUMMARY_COLUMNS = 'id, title, preview, entry_date, created_at, word_count, favorite, conflict_of';

interface SummaryRow {
  id: string;
  title: string;
  preview: string;
  entry_date: string;
  created_at: string;
  word_count: number;
  favorite: number;
  conflict_of: string | null;
}

export class SqliteEntryStore implements EntryStore {
  constructor(
    private readonly db: SqlDatabase,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async get(id: string): Promise<LocalEntry | null> {
    const row = await this.db.get<EntryRow>('SELECT * FROM entries WHERE id = ?', [id]);
    return row ? rowToEntry(row) : null;
  }

  async create(data: EntryData): Promise<string> {
    const id = this.ids.uuid();
    await this.db.transaction(async (tx) => {
      await insertEntry(tx, id, data, this.clock.now().toISOString());
      await markDirty(tx, id, this.ids);
    });
    return id;
  }

  async save(id: string, data: EntryData): Promise<void> {
    const d = derivedColumns(data);
    await this.db.transaction(async (tx) => {
      const { changes } = await tx.run(
        `UPDATE entries SET title = ?, content = ?, plain_text = ?, preview = ?, word_count = ?, entry_date = ?,
           favorite = ?, archived = ?, deleted_at = NULL, updated_at = ? WHERE id = ?`,
        [data.title, JSON.stringify(data.content), d.plainText, d.preview, d.wordCount, data.entryDate,
          data.favorite ? 1 : 0, data.archived ? 1 : 0, this.clock.now().toISOString(), id],
      );
      // Never drop a write: if the row vanished (e.g. replaced by a sync), recreate it.
      if (changes === 0) await insertEntry(tx, id, data, this.clock.now().toISOString());
      await markDirty(tx, id, this.ids);
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const now = this.clock.now().toISOString();
      const { changes } = await tx.run(
        'UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [now, now, id],
      );
      if (changes > 0) await markDirty(tx, id, this.ids);
    });
  }

  /** Keyset pagination on the partial timeline index: cost is O(limit), independent of archive size. */
  async timeline(limit: number, after?: TimelineCursor): Promise<TimelinePage> {
    const rows = after
      ? await this.db.all<SummaryRow>(
          `SELECT ${SUMMARY_COLUMNS} FROM entries
           WHERE deleted_at IS NULL AND (entry_date, created_at, id) < (?, ?, ?)
           ORDER BY entry_date DESC, created_at DESC, id DESC LIMIT ?`,
          [after.entryDate, after.createdAt, after.id, limit + 1],
        )
      : await this.db.all<SummaryRow>(
          `SELECT ${SUMMARY_COLUMNS} FROM entries WHERE deleted_at IS NULL
           ORDER BY entry_date DESC, created_at DESC, id DESC LIMIT ?`,
          [limit + 1],
        );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(
        (r): EntrySummary => ({
          id: r.id,
          title: r.title,
          preview: r.preview,
          entryDate: r.entry_date,
          wordCount: r.word_count,
          favorite: r.favorite === 1,
          isConflictCopy: r.conflict_of !== null,
        }),
      ),
      next: hasMore && last ? { entryDate: last.entry_date, createdAt: last.created_at, id: last.id } : null,
    };
  }
}
