import { countWords, type EntryData, type PushOp, toPlainText } from '@daily/shared';

/** Persisted state of an entry, independent of storage technology. */
export interface EntryState extends EntryData {
  id: string;
  userId: string;
  plainText: string;
  wordCount: number;
  revision: number;
  syncSeq: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WriteDecision =
  | { kind: 'create' }
  | { kind: 'update' }
  | { kind: 'delete' }
  | { kind: 'conflict' }
  | { kind: 'not_found' };

/**
 * Optimistic concurrency rule. A write is applied only when it names the
 * revision currently stored; anything else is a conflict. Ownership must be
 * checked by the caller before this (a foreign entry is treated as absent).
 */
export function decideWrite(current: EntryState | null, op: PushOp): WriteDecision {
  if (op.kind === 'upsert') {
    // Missing on the server: create it, even if the device believed it existed (never drop user data).
    if (!current) return { kind: 'create' };
    return op.baseRevision === current.revision ? { kind: 'update' } : { kind: 'conflict' };
  }
  if (!current) return { kind: 'not_found' };
  return op.baseRevision === current.revision ? { kind: 'delete' } : { kind: 'conflict' };
}

/** Derived, denormalized fields recomputed on every write. */
export function derivedFields(data: EntryData): { plainText: string; wordCount: number } {
  const plainText = toPlainText(data.content);
  return { plainText, wordCount: countWords(plainText) };
}
