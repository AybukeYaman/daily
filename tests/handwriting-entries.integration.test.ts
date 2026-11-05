import { randomUUID } from 'node:crypto';
import { handwritingBlocksOf, type HandwritingBlock, toPlainText } from '@daily/shared';
import { describe, expect, it } from 'vitest';
import { migrate } from '../apps/mobile/src/core/infrastructure/sql/migrations';
import { SqliteEntryStore } from '../apps/mobile/src/core/infrastructure/sqlite-entry-store';
import { HandwritingSession } from '../apps/mobile/src/features/handwriting/application/handwriting-session';
import { JournalService } from '../apps/mobile/src/features/journaling/application/journal-service';
import { createDevice, TestServer } from './support/device';
import { openNodeDatabase } from './support/node-sql-database';

const USER = '11111111-1111-4111-8111-111111111111';
const ids = { uuid: () => randomUUID() };
const clock = { now: () => new Date('2026-11-06T10:00:00Z') };
const meta = { title: '', entryDate: '2026-11-06', favorite: false, archived: false, conflictOf: null };

function pageWithInk(id = randomUUID()): HandwritingBlock {
  const session = new HandwritingSession(ids, clock);
  const samples: number[] = [];
  for (let i = 0; i < 30; i++) samples.push(20 + i * 3, 40 + Math.sin(i / 4) * 8, i * 8, 0.5, 1, 0);
  session.commit(samples, { tool: 'pen', color: '#2a2724', width: 2.5, hasPressure: false, hasTilt: false });
  return { id, type: 'handwriting', strokes: session.serialize(), width: 390, height: 800, background: 'lined', text: '' };
}

async function journal() {
  const db = openNodeDatabase();
  const caps = await migrate(db);
  const store = new SqliteEntryStore(db, ids, clock, caps.fts5);
  return { db, store, journal: new JournalService(store, { kick: () => undefined }, clock) };
}

describe('typed text and handwriting in one entry', () => {
  it('text autosave never overwrites a page saved from the other screen', async () => {
    const { journal: j } = await journal();
    const id = (await j.saveTyped(null, { ...meta, html: '<html><p>hello</p></html>', text: 'hello' }))!;
    const page = pageWithInk();
    await j.savePage(id, page); // handwriting screen
    await j.saveTyped(id, { ...meta, html: '<html><p>hello world</p></html>', text: 'hello world' }); // stale editor

    const entry = (await j.get(id))!;
    expect(toPlainText(entry.content)).toBe('hello world');
    expect(handwritingBlocksOf(entry.content)).toEqual([page]);
  });

  it('a page can start an entry, and pages decode back to strokes', async () => {
    const { journal: j } = await journal();
    const id = await j.createEmpty('2026-11-06');
    const page = pageWithInk();
    await j.savePage(id, page);
    const stored = handwritingBlocksOf((await j.get(id))!.content)[0]!;
    expect(HandwritingSession.deserialize(stored.strokes)).toHaveLength(1);
  });

  it('discards an entry that ended up empty, but keeps one with ink', async () => {
    const { db, journal: j } = await journal();
    const empty = await j.createEmpty();
    await j.discardIfEmpty(empty);
    expect(await j.get(empty)).toBeNull();
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox WHERE entry_id = ?', [empty]))?.n).toBe(0);

    const inked = await j.createEmpty();
    await j.savePage(inked, pageWithInk());
    await j.discardIfEmpty(inked);
    expect(await j.get(inked)).not.toBeNull();
  });

  it('removing the last page and the text leaves an entry that gets discarded', async () => {
    const { journal: j } = await journal();
    const id = await j.createEmpty();
    const page = pageWithInk();
    await j.savePage(id, page);
    await j.removePage(id, page.id);
    await j.discardIfEmpty(id);
    expect(await j.get(id)).toBeNull();
  });

  it('handwriting syncs to another device intact', async () => {
    const server = new TestServer();
    const a = await createDevice(server, USER);
    const b = await createDevice(server, USER);
    const id = await a.journal.createEmpty('2026-11-06');
    const page = pageWithInk();
    await a.journal.savePage(id, page);
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(handwritingBlocksOf((await b.journal.get(id))!.content)).toEqual([page]);
    a.engine.dispose();
    b.engine.dispose();
  });

  it('splits big pages across push requests by size', async () => {
    const server = new TestServer();
    const a = await createDevice(server, USER);
    const big = (n: number): HandwritingBlock => ({ ...pageWithInk(), strokes: 'A'.repeat(n) });
    for (let i = 0; i < 3; i++) {
      const id = await a.journal.createEmpty();
      await a.journal.savePage(id, big(1_800_000)); // ~1.8 MB each, budget is 4 MB per request
    }
    const first = await a.syncStore.claimBatch(Date.now(), 50);
    expect(first.length).toBe(2);
    a.engine.dispose();
  });
});
