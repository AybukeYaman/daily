import type { Credentials, EntryData, EntryDto, OpResult, PullResponse, PushOp, Session } from '@daily/shared';

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

/** Local journal persistence. Every write also marks the entry for sync, atomically. */
export interface EntryStore {
  get(id: string): Promise<LocalEntry | null>;
  create(data: EntryData): Promise<string>;
  save(id: string, data: EntryData): Promise<void>;
  softDelete(id: string): Promise<void>;
  timeline(limit: number, after?: TimelineCursor): Promise<TimelinePage>;
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
