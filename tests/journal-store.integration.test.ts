import { randomUUID } from 'node:crypto';
import { contentFromText, type EntryData, withTypedContent } from '@daily/shared';
import { describe, expect, it } from 'vitest';
import { migrate } from '../apps/mobile/src/core/infrastructure/sql/migrations';
import { SqliteEntryStore, toFtsQuery } from '../apps/mobile/src/core/infrastructure/sqlite-entry-store';
import { JournalService } from '../apps/mobile/src/features/journaling/application/journal-service';
import { createDevice, TestServer } from './support/device';
import { openNodeDatabase } from './support/node-sql-database';

const USER = '11111111-1111-4111-8111-111111111111';
const entry = (body: string, over: Partial<EntryData> = {}): EntryData => ({
  title: '',
  content: contentFromText(body),
  entryDate: '2026-11-05',
  favorite: false,
  archived: false,
  conflictOf: null,
  ...over,
});
const q = (text: string, over = {}) => ({ text, favoritesOnly: false, includeArchived: false, limit: 50, ...over });

async function journalWith(fullTextSearch: boolean) {
  const db = openNodeDatabase();
  const caps = await migrate(db);
  const clock = { current: new Date('2026-11-05T12:00:00Z'), now() { return new Date(this.current); } };
  const store = new SqliteEntryStore(db, { uuid: () => randomUUID() }, clock, fullTextSearch && caps.fts5);
  return { db, caps, clock, store, journal: new JournalService(store, { kick: () => undefined }, clock) };
}

describe('migrations', () => {
  it('run on an empty database and are idempotent', async () => {
    const db = openNodeDatabase();
    const caps = await migrate(db);
    expect(caps.fts5).toBe(true); // better-sqlite3 ships FTS5, like native expo-sqlite
    await migrate(db);
    expect((await db.get<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(2);
  });
});

describe('archive and favorites', () => {
  it('archived entries leave the timeline and appear in the archive', async () => {
    const { journal } = await journalWith(true);
    const keep = await journal.save(null, entry('today'));
    const old = await journal.save(null, entry('old stuff'));
    await journal.save(old, entry('old stuff', { archived: true }));
    expect((await journal.timeline(10)).items.map((i) => i.id)).toEqual([keep]);
    expect((await journal.archived(10)).items.map((i) => i.id)).toEqual([old]);
  });

  it('favorites filter works without a search text', async () => {
    const { journal } = await journalWith(true);
    await journal.save(null, entry('plain'));
    const fav = await journal.save(null, entry('loved', { favorite: true }));
    expect((await journal.search(q('', { favoritesOnly: true }))).map((i) => i.id)).toEqual([fav]);
  });
});

describe('trash', () => {
  it('delete → trash → restore round-trips and syncs as a restore', async () => {
    const server = new TestServer();
    const d = await createDevice(server, USER);
    const id = (await d.journal.save(null, entry('rescue me')))!;
    await d.engine.syncNow();
    await d.journal.remove(id);
    await d.engine.syncNow();
    expect(server.entries.rows.get(id)?.deletedAt).toBeInstanceOf(Date);

    expect((await d.journal.trash()).map((t) => t.id)).toEqual([id]);
    await d.journal.restore(id);
    await d.engine.syncNow();
    expect(server.entries.rows.get(id)?.deletedAt).toBeNull();
    expect((await d.journal.timeline(10)).items.map((i) => i.id)).toEqual([id]);
    d.engine.dispose();
  });

  it('purge removes only old, fully synced trash', async () => {
    const { db, journal, clock } = await journalWith(true);
    const synced = (await journal.save(null, entry('a')))!;
    const unsynced = (await journal.save(null, entry('b')))!;
    await journal.remove(synced);
    await journal.remove(unsynced);
    // Pretend `synced` reached the server: its outbox rows are gone.
    await db.run('DELETE FROM outbox WHERE entry_id = ?', [synced]);

    clock.current = new Date('2026-12-20T12:00:00Z'); // > 30 days later
    expect(await journal.purgeOldTrash()).toBe(1);
    expect(await journal.get(synced)).toBeNull();
    expect(await journal.get(unsynced)).not.toBeNull(); // still has something to send
  });
});

describe('calendar', () => {
  it('counts entries per day and lists a day', async () => {
    const { journal } = await journalWith(true);
    await journal.save(null, entry('one', { entryDate: '2026-11-03' }));
    await journal.save(null, entry('two', { entryDate: '2026-11-03' }));
    await journal.save(null, entry('three', { entryDate: '2026-11-20' }));
    await journal.save(null, entry('hidden', { entryDate: '2026-11-20', archived: true }));
    await journal.save(null, entry('other month', { entryDate: '2026-12-01' }));
    expect(await journal.activity('2026-11-01', '2026-11-30')).toEqual({ '2026-11-03': 2, '2026-11-20': 1 });
    expect((await journal.onDate('2026-11-03')).map((e) => e.preview).sort()).toEqual(['one', 'two']);
  });
});

describe('search', () => {
  it.each([true, false])('finds by title and body, prefix and accents (fts=%s)', async (fts) => {
    const { journal } = await journalWith(fts);
    await journal.save(null, entry('İstanbul’da güzel bir gün geçirdim', { title: 'Hafta sonu' }));
    await journal.save(null, { ...entry(''), content: withTypedContent({ v: 1, blocks: [] }, '<html><p><b>Toplantı</b> notları</p></html>', 'Toplantı notları') });
    await journal.save(null, entry('nothing here'));

    expect((await journal.search(q('Hafta'))).length).toBe(1);
    expect((await journal.search(q('toplantı'))).length).toBe(1);
    if (fts) {
      expect((await journal.search(q('gün'))).length).toBe(1); // prefix: "gün" → "gün"
      expect((await journal.search(q('gun'))).length).toBe(1); // diacritics folded
      expect((await journal.search(q('istanbul'))).length).toBe(1); // İ → i
      expect((await journal.search(q('topl not'))).length).toBe(1); // every word as prefix
    }
    expect(await journal.search(q('zzz'))).toEqual([]);
  });

  it('keeps the index in sync with edits and deletes', async () => {
    const { journal } = await journalWith(true);
    const id = (await journal.save(null, entry('first draft')))!;
    await journal.save(id, entry('final version'));
    expect(await journal.search(q('draft'))).toEqual([]);
    expect((await journal.search(q('final'))).length).toBe(1);
    await journal.remove(id);
    expect(await journal.search(q('final'))).toEqual([]);
  });

  it('never lets user input become FTS syntax', async () => {
    const { journal } = await journalWith(true);
    await journal.save(null, entry('well-known "quote" (test)'));
    expect(toFtsQuery('a OR b')).toBe('"a"* "OR"* "b"*');
    expect(toFtsQuery('"); DROP TABLE entries; --')).toBe('"DROP"* "TABLE"* "entries"*');
    expect(toFtsQuery('  ')).toBeNull();
    expect((await journal.search(q('well-known'))).length).toBe(1);
    expect((await journal.search(q('" * NEAR( ^'))).length).toBe(0);
  });

  it('LIKE fallback escapes wildcards', async () => {
    const { journal } = await journalWith(false);
    await journal.save(null, entry('100% sure'));
    await journal.save(null, entry('100 percent'));
    expect((await journal.search(q('100%'))).length).toBe(1);
  });
});
