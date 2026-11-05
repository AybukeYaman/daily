import { countWords, type EntryContent, type EntryData, previewOf, toPlainText } from '@daily/shared';
import type {
  Clock,
  EntryStore,
  EntrySummary,
  IdGenerator,
  LocalEntry,
  SearchQuery,
  TimelineCursor,
  TimelinePage,
  TrashItem,
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
export async function markDirty(tx: SqlExecutor, entryId: string, ids: IdGenerator, checkpoint = false): Promise<void> {
  const latest = await tx.get<{ seq: number; attempts: number }>(
    'SELECT seq, attempts FROM outbox WHERE entry_id = ? ORDER BY seq DESC LIMIT 1',
    [entryId],
  );
  if (latest && latest.attempts === 0) {
    if (checkpoint) await tx.run('UPDATE outbox SET checkpoint = 1 WHERE seq = ?', [latest.seq]);
    return;
  }
  await tx.run('INSERT INTO outbox (op_id, entry_id, checkpoint) VALUES (?, ?, ?)', [ids.uuid(), entryId, checkpoint ? 1 : 0]);
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

const SUMMARY_COLUMNS =
  'e.id, e.title, e.preview, e.entry_date, e.created_at, e.word_count, e.favorite, e.conflict_of';
const TIMELINE_ORDER = 'ORDER BY e.entry_date DESC, e.created_at DESC, e.id DESC';

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

function toSummary(r: SummaryRow): EntrySummary {
  return {
    id: r.id,
    title: r.title,
    preview: r.preview,
    entryDate: r.entry_date,
    wordCount: r.word_count,
    favorite: r.favorite === 1,
    isConflictCopy: r.conflict_of !== null,
  };
}

/**
 * User text → FTS5 query: every word must match as a prefix ("gün" finds "günlük").
 * Operators and quotes are stripped, so input can never break or widen the query.
 */
export function toFtsQuery(input: string): string | null {
  const tokens = input
    .normalize('NFC')
    .replace(/["*^():{}[\]+\-.,;!?/\\]/g, ' ') // operators/punctuation separate words, like the tokenizer does
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  return tokens.length > 0 ? tokens.map((t) => `"${t}"*`).join(' ') : null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export class SqliteEntryStore implements EntryStore {
  constructor(
    private readonly db: SqlDatabase,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    /** False on web builds without FTS5: search falls back to LIKE. */
    private readonly fullTextSearch: boolean,
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

  async save(id: string, data: EntryData, options: { checkpoint?: boolean } = {}): Promise<void> {
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
      await markDirty(tx, id, this.ids, options.checkpoint);
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.setDeleted(id, this.clock.now().toISOString());
  }

  async restore(id: string): Promise<void> {
    await this.setDeleted(id, null);
  }

  private async setDeleted(id: string, deletedAt: string | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { changes } = await tx.run(
        `UPDATE entries SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS ${deletedAt ? 'NULL' : 'NOT NULL'}`,
        [deletedAt, this.clock.now().toISOString(), id],
      );
      if (changes > 0) await markDirty(tx, id, this.ids);
    });
  }

  timeline(limit: number, after?: TimelineCursor): Promise<TimelinePage> {
    return this.page('e.deleted_at IS NULL AND e.archived = 0', limit, after);
  }

  archived(limit: number, after?: TimelineCursor): Promise<TimelinePage> {
    return this.page('e.deleted_at IS NULL AND e.archived = 1', limit, after);
  }

  /** Keyset pagination on a partial index: cost is O(limit), independent of archive size. */
  private async page(where: string, limit: number, after?: TimelineCursor): Promise<TimelinePage> {
    const rows = after
      ? await this.db.all<SummaryRow>(
          `SELECT ${SUMMARY_COLUMNS} FROM entries e
           WHERE ${where} AND (e.entry_date, e.created_at, e.id) < (?, ?, ?) ${TIMELINE_ORDER} LIMIT ?`,
          [after.entryDate, after.createdAt, after.id, limit + 1],
        )
      : await this.db.all<SummaryRow>(`SELECT ${SUMMARY_COLUMNS} FROM entries e WHERE ${where} ${TIMELINE_ORDER} LIMIT ?`, [
          limit + 1,
        ]);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(toSummary),
      next: hasMore && last ? { entryDate: last.entry_date, createdAt: last.created_at, id: last.id } : null,
    };
  }

  async byDate(isoDate: string): Promise<EntrySummary[]> {
    const rows = await this.db.all<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM entries e WHERE e.deleted_at IS NULL AND e.archived = 0 AND e.entry_date = ? ${TIMELINE_ORDER}`,
      [isoDate],
    );
    return rows.map(toSummary);
  }

  async dayCounts(fromIsoDate: string, toIsoDate: string): Promise<Record<string, number>> {
    const rows = await this.db.all<{ entry_date: string; n: number }>(
      `SELECT entry_date, COUNT(*) AS n FROM entries
       WHERE deleted_at IS NULL AND archived = 0 AND entry_date BETWEEN ? AND ? GROUP BY entry_date`,
      [fromIsoDate, toIsoDate],
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[r.entry_date] = r.n;
    return out;
  }

  async trash(limit: number): Promise<TrashItem[]> {
    const rows = await this.db.all<SummaryRow & { deleted_at: string }>(
      `SELECT ${SUMMARY_COLUMNS}, e.deleted_at FROM entries e WHERE e.deleted_at IS NOT NULL ORDER BY e.deleted_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({ ...toSummary(r), deletedAt: r.deleted_at }));
  }

  async purgeTrash(beforeIso: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      const { changes } = await tx.run(
        `DELETE FROM entries WHERE deleted_at IS NOT NULL AND deleted_at < ?
           AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.entry_id = entries.id)`,
        [beforeIso],
      );
      return changes;
    });
  }

  async search(q: SearchQuery): Promise<EntrySummary[]> {
    const filters = ['e.deleted_at IS NULL'];
    if (!q.includeArchived) filters.push('e.archived = 0');
    if (q.favoritesOnly) filters.push('e.favorite = 1');
    const text = q.text.trim();

    if (text.length === 0) {
      // Filters alone (e.g. "favorites"): newest first.
      const rows = await this.db.all<SummaryRow>(
        `SELECT ${SUMMARY_COLUMNS} FROM entries e WHERE ${filters.join(' AND ')} ${TIMELINE_ORDER} LIMIT ?`,
        [q.limit],
      );
      return rows.map(toSummary);
    }

    if (this.fullTextSearch) {
      const match = toFtsQuery(text);
      if (!match) return [];
      const rows = await this.db.all<SummaryRow>(
        `SELECT ${SUMMARY_COLUMNS} FROM entries_fts f JOIN entries e ON e.rowid = f.rowid
         WHERE entries_fts MATCH ? AND ${filters.join(' AND ')}
         ORDER BY bm25(entries_fts, 4.0, 1.0), e.entry_date DESC LIMIT ?`,
        [match, q.limit],
      );
      return rows.map(toSummary);
    }

    const like = `%${escapeLike(text)}%`;
    const rows = await this.db.all<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM entries e
       WHERE ${filters.join(' AND ')} AND (e.title LIKE ? ESCAPE '\\' OR e.plain_text LIKE ? ESCAPE '\\')
       ${TIMELINE_ORDER} LIMIT ?`,
      [like, like, q.limit],
    );
    return rows.map(toSummary);
  }
}
