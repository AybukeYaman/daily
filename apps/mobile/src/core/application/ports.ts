import type { Credentials, EntryData, EntryDto, OpResult, PullResponse, PushOp, Session, VersionDetail, VersionSummary } from '@daily/shared';

export interface LocalEntry extends EntryData {
  id: string;
  wordCount: number;
  /** Last revision acknowledged by the server; null until first successful sync. */
  serverRevision: number | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntrySummary {
  id: string;
  title: string;
  preview: string;
  entryDate: string;
  wordCount: number;
  favorite: boolean;
  isConflictCopy: boolean;
}

export interface TimelineCursor {
  entryDate: string;
  createdAt: string;
  id: string;
}

export interface TimelinePage {
  items: EntrySummary[];
  next: TimelineCursor | null;
}

export interface TrashItem extends EntrySummary {
  deletedAt: string;
}

export interface SearchQuery {
  text: string;
  favoritesOnly: boolean;
  includeArchived: boolean;
  limit: number;
}

/** Local journal persistence. Every write also marks the entry for sync, atomically. */
export interface EntryStore {
  get(id: string): Promise<LocalEntry | null>;
  create(data: EntryData): Promise<string>;
  /** `checkpoint`: the server keeps the replaced state as a version (used by restore). */
  save(id: string, data: EntryData, options?: { checkpoint?: boolean }): Promise<void>;
  /**
   * Read-modify-write in one transaction: `change` receives the stored data and
   * returns the new data. Two screens editing different parts of the same entry
   * (typed text, handwriting pages) can never overwrite each other.
   * Returns false if the entry does not exist.
   */
  update(id: string, change: (current: EntryData) => EntryData, options?: { checkpoint?: boolean }): Promise<boolean>;
  softDelete(id: string): Promise<void>;
  /** Removes an entry that has nothing in it. Never-synced entries vanish; synced ones go to trash. */
  discardIfEmpty(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  /** Non-archived, non-deleted entries, newest day first. */
  timeline(limit: number, after?: TimelineCursor): Promise<TimelinePage>;
  archived(limit: number, after?: TimelineCursor): Promise<TimelinePage>;
  byDate(isoDate: string): Promise<EntrySummary[]>;
  /** Entry count per day in [from, to] (inclusive ISO dates), archived excluded. */
  dayCounts(fromIsoDate: string, toIsoDate: string): Promise<Record<string, number>>;
  trash(limit: number): Promise<TrashItem[]>;
  /** Hard-deletes trash older than `beforeIso` that has nothing left to sync. Returns how many. */
  purgeTrash(beforeIso: string): Promise<number>;
  search(query: SearchQuery): Promise<EntrySummary[]>;
}

/** Local side of the sync protocol (outbox + pull cursor). */
export interface SyncStore {
  /** Picks the next op per entry, freezing its payload. Returns ops ready to send. */
  claimBatch(nowMs: number, max: number): Promise<PushOp[]>;
  scheduleRetry(opIds: string[], nowMs: number): Promise<void>;
  applyResults(results: OpResult[]): Promise<void>;
  cursor(): Promise<number>;
  applyPulled(entries: EntryDto[], cursor: number): Promise<void>;
  counts(): Promise<{ pending: number; failed: number }>;
  retryFailed(): Promise<void>;
  /** Earliest time (ms) a waiting op becomes due, or null if none is waiting. */
  nextDueAt(): Promise<number | null>;
}

export class NetworkError extends Error {
  override name = 'NetworkError';
}
export class AuthExpiredError extends Error {
  override name = 'AuthExpiredError';
}

export interface SyncApi {
  push(ops: PushOp[]): Promise<OpResult[]>;
  pull(since: number): Promise<PullResponse>;
}

/** Server-side version history (requires an account). */
export interface HistoryApi {
  list(entryId: string): Promise<VersionSummary[]>;
  get(entryId: string, revision: number): Promise<VersionDetail>;
}

export interface AuthApi {
  register(credentials: Credentials): Promise<Session>;
  login(credentials: Credentials): Promise<Session>;
  refresh(refreshToken: string): Promise<Session>;
  logout(refreshToken: string): Promise<void>;
}

/** Supplies bearer tokens to HTTP adapters without them knowing how sessions work. */
export interface AccessTokenProvider {
  accessToken(): Promise<string | null>;
  /** Called after a 401; returns a fresh token or null if the session is gone. */
  refreshAfterUnauthorized(): Promise<string | null>;
}

export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session | null): Promise<void>;
}

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface IdGenerator {
  uuid(): string;
}

export interface Clock {
  now(): Date;
}
