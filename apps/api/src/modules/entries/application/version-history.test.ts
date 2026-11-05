import { beforeEach, describe, expect, it } from 'vitest';
import { contentFromText, type PushOp } from '@daily/shared';
import { NotFoundError } from '../../../core/domain/errors.js';
import { DirectTransactionRunner, FixedClock, MemoryEntries, MemoryOpLog, MemorySequence, MemoryVersions } from '../../../test/in-memory.js';
import { PushChangesUseCase } from '../../sync/application/push-changes.use-case.js';
import { GetEntryVersionUseCase, ListEntryVersionsUseCase } from './version-history.use-cases.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ENTRY = '33333333-3333-4333-8333-333333333333';
const upsert = (baseRevision: number | null, text: string): PushOp => ({
  kind: 'upsert',
  opId: crypto.randomUUID(),
  entryId: ENTRY,
  baseRevision,
  data: { title: '', content: contentFromText(text), entryDate: '2026-11-05', favorite: false, archived: false, conflictOf: null },
});

describe('version history', () => {
  let clock: FixedClock;
  let versions: MemoryVersions;
  let push: PushChangesUseCase;

  beforeEach(async () => {
    clock = new FixedClock();
    versions = new MemoryVersions(clock);
    push = new PushChangesUseCase(new MemoryEntries(clock), versions, new MemoryOpLog(), new MemorySequence(), new DirectTransactionRunner(), clock);
    await push.execute(ALICE, [upsert(null, 'first')]);
    clock.advance(11 * 60_000);
    await push.execute(ALICE, [upsert(1, 'second')]);
    clock.advance(11 * 60_000);
    await push.execute(ALICE, [upsert(2, 'third')]);
  });

  it('lists the owner’s versions newest first with previews', async () => {
    const list = await new ListEntryVersionsUseCase(versions).execute(ALICE, ENTRY);
    expect(list.map((v) => [v.revision, v.preview])).toEqual([[2, 'second'], [1, 'first']]);
  });

  it('returns full content of one version', async () => {
    const v = await new GetEntryVersionUseCase(versions).execute(ALICE, ENTRY, 1);
    expect(v.content).toEqual(contentFromText('first'));
  });

  it('is invisible to other users', async () => {
    expect(await new ListEntryVersionsUseCase(versions).execute(BOB, ENTRY)).toEqual([]);
    await expect(new GetEntryVersionUseCase(versions).execute(BOB, ENTRY, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps only the newest N snapshots', async () => {
    await versions.prune(ENTRY, 1);
    expect(versions.snapshots.map((s) => s.revision)).toEqual([2]);
  });
});
