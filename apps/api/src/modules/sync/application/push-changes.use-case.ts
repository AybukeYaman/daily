import { Injectable } from '@nestjs/common';
import type { OpResult, PushOp } from '@daily/shared';
import { Clock, TransactionRunner } from '../../../core/application/ports.js';
import { ConcurrentModificationError } from '../../../core/domain/errors.js';
import { decideWrite, derivedFields, type EntryState } from '../../entries/domain/journal-entry.js';
import { toEntryDto } from '../../entries/application/entry-dto.js';
import { EntryRepository, EntryVersionRepository } from '../../entries/application/ports.js';
import { type StoredOutcome, SyncOperationLog, UserSyncSequence } from './ports.js';

@Injectable()
export class PushChangesUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly versions: EntryVersionRepository,
    private readonly opLog: SyncOperationLog,
    private readonly sequence: UserSyncSequence,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /** Ops are applied in order, each in its own transaction, so one bad op never blocks the rest. */
  async execute(userId: string, ops: PushOp[]): Promise<OpResult[]> {
    const results: OpResult[] = [];
    for (const op of ops) results.push(await this.tx.run(() => this.applyOne(userId, op)));
    return results;
  }

  private async applyOne(userId: string, op: PushOp): Promise<OpResult> {
    const syncSeq = await this.sequence.next(userId); // lock first (see UserSyncSequence)

    const found = await this.entries.findById(op.entryId);
    // A foreign entry is indistinguishable from a missing one (no IDOR, no existence leak).
    const current = found && found.userId === userId ? found : null;

    const previous = await this.opLog.find(userId, op.opId);
    if (previous) return this.toResult(op.opId, previous, current);

    const outcome: StoredOutcome = found && !current
      ? { status: 'rejected', reason: 'not_found' }
      : await this.apply(userId, op, current, syncSeq);

    await this.opLog.record(userId, op.opId, op.entryId, outcome);
    return this.toResult(op.opId, outcome, current);
  }

  private async apply(userId: string, op: PushOp, current: EntryState | null, syncSeq: number): Promise<StoredOutcome> {
    const decision = decideWrite(current, op);
    if (decision.kind === 'not_found') return { status: 'rejected', reason: 'not_found' };
    if (decision.kind === 'conflict') return { status: 'conflict' };

    if (decision.kind === 'create' && op.kind === 'upsert') {
      await this.entries.insert({
        id: op.entryId,
        userId,
        ...op.data,
        ...derivedFields(op.data),
        revision: 1,
        syncSeq,
        deletedAt: null,
      });
      return { status: 'applied', revision: 1, syncSeq };
    }

    if (!current) throw new Error('Invariant violated: update/delete without current entry');
    const revision = current.revision + 1;
    const changes =
      op.kind === 'upsert'
        ? { ...op.data, ...derivedFields(op.data), deletedAt: null } // an upsert onto a tombstone restores it
        : { deletedAt: this.clock.now() };

    await this.versions.snapshot(current);
    const saved = await this.entries.update({ ...current, ...changes, revision, syncSeq }, current.revision);
    if (!saved) throw new ConcurrentModificationError('Entry changed during write');
    return { status: 'applied', revision, syncSeq };
  }

  /** `current` is the entry as read in this transaction (before this op), used for conflict replies. */
  private toResult(opId: string, outcome: StoredOutcome, current: EntryState | null): OpResult {
    switch (outcome.status) {
      case 'applied':
        return { opId, status: 'applied', revision: outcome.revision, syncSeq: outcome.syncSeq };
      case 'rejected':
        return { opId, status: 'rejected', reason: outcome.reason };
      case 'conflict':
        return current
          ? { opId, status: 'conflict', entry: toEntryDto(current) }
          : { opId, status: 'rejected', reason: 'not_found' };
    }
  }
}
