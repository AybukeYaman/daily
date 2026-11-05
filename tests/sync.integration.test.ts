import { contentFromText, toPlainText, type EntryData } from '@daily/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createDevice, TestServer } from './support/device';

const USER = '11111111-1111-4111-8111-111111111111';
const text = (body: string, title = ''): EntryData => ({
  title,
  content: contentFromText(body),
  entryDate: '2026-11-05',
  favorite: false,
  archived: false,
  conflictOf: null,
});

const devices: Awaited<ReturnType<typeof createDevice>>[] = [];
async function device(server: TestServer) {
  const d = await createDevice(server, USER);
  devices.push(d);
  return d;
}
afterEach(() => {
  for (const d of devices.splice(0)) d.engine.dispose();
});

async function bodies(d: Awaited<ReturnType<typeof createDevice>>) {
  const page = await d.journal.timeline(100);
  const all = await Promise.all(page.items.map((i) => d.journal.get(i.id)));
  return all.map((e) => toPlainText(e!.content)).sort();
}

describe('device ⇄ server sync (real SQLite + real server use cases)', () => {
  it('writes offline, syncs later, and a second device receives it', async () => {
    const server = new TestServer();
    const a = await device(server);
    a.net.online = false;

    const id = await a.journal.save(null, text('offline thoughts'));
    await a.engine.syncNow();
    expect(a.engine.status.get().phase).toBe('offline');
    expect((await a.syncStore.counts()).pending).toBe(1);

    a.net.online = true;
    await a.engine.syncNow();
    expect(a.engine.status.get()).toMatchObject({ phase: 'synced', pending: 0 });
    expect((await a.entries.get(id!))?.serverRevision).toBe(1);

    const b = await device(server);
    await b.engine.syncNow();
    expect(await bodies(b)).toEqual(['offline thoughts']);
  });

  it('coalesces a burst of edits into one op', async () => {
    const server = new TestServer();
    const a = await device(server);
    let id: string | null = null;
    for (const word of ['B', 'Bu', 'Bug', 'Bugü', 'Bugün']) id = await a.journal.save(id, text(word));
    expect((await a.syncStore.counts()).pending).toBe(1);
    await a.engine.syncNow();
    expect(server.entries.rows.get(id!)).toMatchObject({ revision: 1, plainText: 'Bugün' });
  });

  it('a lost response does not lose the edit made while the request was in flight', async () => {
    const server = new TestServer();
    const a = await device(server);
    const id = await a.journal.save(null, text('v1'));

    a.net.dropResponses = true; // server applies v1, device never hears back
    await a.engine.syncNow();
    a.net.dropResponses = false;

    await a.journal.save(id, text('v2 written after'));
    await a.engine.syncNow();

    expect(server.entries.rows.get(id!)).toMatchObject({ revision: 2, plainText: 'v2 written after' });
    expect(a.engine.status.get().phase).toBe('synced');
    expect(await a.syncStore.counts()).toEqual({ pending: 0, failed: 0 });
    expect(await bodies(a)).toEqual(['v2 written after']); // no spurious conflict copy
  });

  it('concurrent edits on two devices: nothing is lost, the late writer gets a conflict copy', async () => {
    const server = new TestServer();
    const a = await device(server);
    const b = await device(server);
    const id = await a.journal.save(null, text('original'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    await a.journal.save(id, text('edited on phone'));
    await b.journal.save(id, text('edited on tablet'));
    await a.engine.syncNow();
    await b.engine.syncNow(); // conflict here
    await a.engine.syncNow(); // receives the copy

    for (const d of [a, b]) expect(await bodies(d)).toEqual(['edited on phone', 'edited on tablet']);
    const copy = [...server.entries.rows.values()].find((e) => e.conflictOf === id);
    expect(copy?.plainText).toBe('edited on tablet');
  });

  it('delete on one device vs edit on another keeps the edit', async () => {
    const server = new TestServer();
    const a = await device(server);
    const b = await device(server);
    const id = await a.journal.save(null, text('shared'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    await a.journal.remove(id!);
    await b.journal.save(id, text('still important'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    for (const d of [a, b]) expect(await bodies(d)).toEqual(['still important']);
  });

  it('automatic retries respect backoff; a manual sync does not wait', async () => {
    const server = new TestServer();
    const a = await device(server);
    a.net.online = false;
    await a.journal.save(null, text('later'));
    await a.engine.syncNow({ manual: false });
    a.net.online = true;

    await a.engine.syncNow({ manual: false }); // still inside the backoff window
    expect(a.engine.status.get()).toMatchObject({ phase: 'waiting', pending: 1 });
    expect(server.entries.rows.size).toBe(0);

    await a.engine.syncNow(); // user taps "sync now"
    expect(a.engine.status.get()).toMatchObject({ phase: 'synced', pending: 0 });
  });

  it('deleting a never-synced entry sends nothing', async () => {
    const server = new TestServer();
    const a = await device(server);
    a.net.online = false;
    const id = await a.journal.save(null, text('typo'));
    await a.journal.remove(id!);
    a.net.online = true;
    await a.engine.syncNow();
    expect(server.entries.rows.size).toBe(0);
    expect(await a.syncStore.counts()).toEqual({ pending: 0, failed: 0 });
  });

  it('restoring an old version is a new revision; the replaced text stays in history', async () => {
    const server = new TestServer();
    const a = await device(server);
    const id = (await a.journal.save(null, text('my first thoughts')))!;
    await a.engine.syncNow();
    server.clock.advance(11 * 60_000);
    await a.journal.save(id, text('accidentally overwritten'));
    await a.engine.syncNow();

    const [old] = await a.history.list(id);
    expect(old).toMatchObject({ revision: 1, preview: 'my first thoughts' });
    await a.history.restore(id, await a.history.get(id, old!.revision));
    await a.engine.syncNow();

    expect(server.entries.rows.get(id)).toMatchObject({ revision: 3, plainText: 'my first thoughts' });
    // Restored within the 10-minute window, yet the replaced text is still recoverable.
    expect((await a.history.list(id)).map((v) => v.preview)).toEqual(['accidentally overwritten', 'my first thoughts']);
    expect(await bodies(a)).toEqual(['my first thoughts']);
  });

  it('empty drafts are never created', async () => {
    const server = new TestServer();
    const a = await device(server);
    expect(await a.journal.save(null, text('   '))).toBeNull();
    expect((await a.journal.timeline(10)).items).toEqual([]);
  });

  it('timeline pages through a large archive in order', async () => {
    const server = new TestServer();
    const a = await device(server);
    for (let i = 0; i < 75; i++) {
      await a.journal.save(null, { ...text(`entry ${i}`), entryDate: `2026-${String(1 + (i % 12)).padStart(2, '0')}-10` });
    }
    const seen: string[] = [];
    let page = await a.journal.timeline(30);
    seen.push(...page.items.map((i) => i.entryDate));
    while (page.next) {
      page = await a.journal.timeline(30, page.next);
      seen.push(...page.items.map((i) => i.entryDate));
    }
    expect(seen).toHaveLength(75);
    expect([...seen].sort().reverse()).toEqual(seen);
  });
});
