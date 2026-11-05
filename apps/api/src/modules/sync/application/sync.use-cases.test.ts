import { beforeEach, describe, expect, it } from 'vitest';
import { contentFromText, type EntryData, type PushOp } from '@daily/shared';
import {
  DirectTransactionRunner,
  FixedClock,
  MemoryEntries,
  MemoryOpLog,
  MemorySequence,
  MemoryVersions,
} from '../../../test/in-memory.js';
import { PullChangesUseCase } from './pull-changes.use-case.js';
import { PushChangesUseCase } from './push-changes.use-case.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ENTRY = '33333333-3333-4333-8333-333333333333';

const data = (text: string, over: Partial<EntryData> = {}): EntryData => ({
  title: '',
  content: contentFromText(text),
  entryDate: '2026-11-05',
  favorite: false,
  archived: false,
  conflictOf: null,
  ...over,
});
const upsert = (baseRevision: number | null, text: string, opId = crypto.randomUUID()): PushOp => ({
  kind: 'upsert',
  opId,
  entryId: ENTRY,
  baseRevision,
  data: data(text),
});

describe('sync use cases', () => {
  let clock: FixedClock;
  let entries: MemoryEntries;
  let versions: MemoryVersions;
  let push: PushChangesUseCase;
  let pull: PullChangesUseCase;

  beforeEach(() => {
    clock = new FixedClock();
    entries = new MemoryEntries(clock);
    versions = new MemoryVersions(clock);
    push = new PushChangesUseCase(entries, versions, new MemoryOpLog(), new MemorySequence(), new DirectTransactionRunner(), clock);
    pull = new PullChangesUseCase(entries);
  });

  it('creates an entry at revision 1 with derived fields', async () => {
    const [r] = await push.execute(ALICE, [upsert(null, 'Bugün güzel bir gün')]);
    expect(r).toMatchObject({ status: 'applied', revision: 1 });
    expect(entries.rows.get(ENTRY)).toMatchObject({ wordCount: 4, plainText: 'Bugün güzel bir gün' });
  });

  it('applies an update on the right base revision and snapshots the previous version', async () => {
    await push.execute(ALICE, [upsert(null, 'v1')]);
    const [r] = await push.execute(ALICE, [upsert(1, 'v2')]);
    expect(r).toMatchObject({ status: 'applied', revision: 2 });
    expect(versions.snapshots.map((s) => s.plainText)).toEqual(['v1']);
  });

  it('never overwrites a newer revision: stale base returns conflict with server data', async () => {
    await push.execute(ALICE, [upsert(null, 'v1')]);
    await push.execute(ALICE, [upsert(1, 'from device A')]);
    const [r] = await push.execute(ALICE, [upsert(1, 'from device B')]);
    expect(r?.status).toBe('conflict');
    if (r?.status === 'conflict') expect(r.entry.revision).toBe(2);
    expect(entries.rows.get(ENTRY)?.plainText).toBe('from device A');
  });

  it('is idempotent: a retried op returns the original result and does not apply twice', async () => {
    const op = upsert(null, 'once');
    const [first] = await push.execute(ALICE, [op]);
    await push.execute(ALICE, [upsert(1, 'later edit')]);
    const [retry] = await push.execute(ALICE, [op]);
    expect(retry).toEqual(first);
    expect(entries.rows.get(ENTRY)?.revision).toBe(2);
  });

  it('rejects writes to another user’s entry without leaking it', async () => {
    await push.execute(ALICE, [upsert(null, 'secret')]);
    const [r] = await push.execute(BOB, [upsert(1, 'overwrite')]);
    expect(r).toEqual({ opId: expect.any(String), status: 'rejected', reason: 'not_found' });
    expect(entries.rows.get(ENTRY)?.plainText).toBe('secret');
  });

  it('soft-deletes, and an upsert on the tombstone restores the entry', async () => {
    await push.execute(ALICE, [upsert(null, 'keep me')]);
    const [del] = await push.execute(ALICE, [{ kind: 'delete', opId: crypto.randomUUID(), entryId: ENTRY, baseRevision: 1 }]);
    expect(del).toMatchObject({ status: 'applied', revision: 2 });
    expect(entries.rows.get(ENTRY)?.deletedAt).toBeInstanceOf(Date);

    await push.execute(ALICE, [upsert(2, 'keep me')]);
    expect(entries.rows.get(ENTRY)?.deletedAt).toBeNull();
  });

  it('keeps one snapshot per 10-minute window while typing, always on delete', async () => {
    await push.execute(ALICE, [upsert(null, 'v1')]);
    for (let rev = 1; rev <= 5; rev++) {
      clock.advance(5_000); // a sync every few seconds while writing
      await push.execute(ALICE, [upsert(rev, `v${rev + 1}`)]);
    }
    expect(versions.snapshots.map((s) => s.plainText)).toEqual(['v1']);

    clock.advance(10 * 60_000);
    await push.execute(ALICE, [upsert(6, 'v7')]);
    await push.execute(ALICE, [{ kind: 'delete', opId: crypto.randomUUID(), entryId: ENTRY, baseRevision: 7 }]);
    expect(versions.snapshots.map((s) => s.plainText)).toEqual(['v1', 'v6', 'v7']);
  });

  it('pulls changes by cursor in pages, including tombstones', async () => {
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    await push.execute(ALICE, ids.map((entryId) => ({ ...upsert(null, entryId), entryId })));

    const page1 = await pull.execute(ALICE, { since: 0, limit: 3 });
    expect(page1.entries).toHaveLength(3);
    expect(page1.hasMore).toBe(true);

    const page2 = await pull.execute(ALICE, { since: page1.cursor, limit: 3 });
    expect(page2.entries.map((e) => e.id)).toEqual(ids.slice(3));
    expect(page2.hasMore).toBe(false);

    expect((await pull.execute(BOB, { since: 0, limit: 10 })).entries).toEqual([]);
  });
});
