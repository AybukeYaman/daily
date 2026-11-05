import type { EntryState } from '../domain/journal-entry.js';

export type EntryWrite = Omit<EntryState, 'createdAt' | 'updatedAt'>;

export abstract class EntryRepository {
  /** Looks up by id regardless of owner; callers must enforce ownership. */
  abstract findById(id: string): Promise<EntryState | null>;
  abstract insert(entry: EntryWrite): Promise<EntryState>;
  /** Compare-and-set on revision. Returns null if the stored revision is no longer `expectedRevision`. */
  abstract update(entry: EntryWrite, expectedRevision: number): Promise<EntryState | null>;
  abstract listChangedSince(userId: string, sinceSeq: number, limit: number): Promise<EntryState[]>;
}

export abstract class EntryVersionRepository {
  /** Stores an immutable copy of `entry` as it was before a change. */
  abstract snapshot(entry: EntryState): Promise<void>;
}
