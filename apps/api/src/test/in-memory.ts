/** In-memory port implementations for fast application-layer tests (no database, no Nest container). */
import type { RefreshTokenRecord } from '../modules/auth/domain/refresh-token.js';
import {
  AccessTokenService,
  OpaqueTokenFactory,
  PasswordHasher,
  RefreshTokenRepository,
  type UserCredentialsRecord,
  UserRepository,
} from '../modules/auth/application/ports.js';
import { Clock, TransactionRunner } from '../core/application/ports.js';
import type { EntryState } from '../modules/entries/domain/journal-entry.js';
import { EntryRepository, EntryVersionRepository, type EntryWrite } from '../modules/entries/application/ports.js';
import { type StoredOutcome, SyncOperationLog, UserSyncSequence } from '../modules/sync/application/ports.js';

export class FixedClock extends Clock {
  constructor(public current = new Date('2026-11-05T12:00:00.000Z')) {
    super();
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class DirectTransactionRunner extends TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export class MemoryEntries extends EntryRepository {
  readonly rows = new Map<string, EntryState>();
  constructor(private readonly clock: Clock) {
    super();
  }
  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }
  async insert(e: EntryWrite) {
    const row = { ...structuredClone(e), createdAt: this.clock.now(), updatedAt: this.clock.now() };
    this.rows.set(e.id, row);
    return structuredClone(row);
  }
  async update(e: EntryWrite, expectedRevision: number) {
    const row = this.rows.get(e.id);
    if (!row || row.userId !== e.userId || row.revision !== expectedRevision) return null;
    const next = { ...row, ...structuredClone(e), updatedAt: this.clock.now() };
    this.rows.set(e.id, next);
    return structuredClone(next);
  }
  async listChangedSince(userId: string, since: number, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId && r.syncSeq > since)
      .sort((a, b) => a.syncSeq - b.syncSeq)
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }
}

export class MemoryVersions extends EntryVersionRepository {
  readonly snapshots: EntryState[] = [];
  async snapshot(entry: EntryState) {
    this.snapshots.push(structuredClone(entry));
  }
}

export class MemoryOpLog extends SyncOperationLog {
  readonly rows = new Map<string, StoredOutcome>();
  async find(userId: string, opId: string) {
    return this.rows.get(`${userId}:${opId}`) ?? null;
  }
  async record(userId: string, opId: string, _entryId: string, outcome: StoredOutcome) {
    const key = `${userId}:${opId}`;
    if (this.rows.has(key)) throw new Error('duplicate op (primary key violation)');
    this.rows.set(key, outcome);
  }
}

export class MemorySequence extends UserSyncSequence {
  private readonly seqs = new Map<string, number>();
  async next(userId: string) {
    const n = (this.seqs.get(userId) ?? 0) + 1;
    this.seqs.set(userId, n);
    return n;
  }
}

export class MemoryUsers extends UserRepository {
  readonly rows: UserCredentialsRecord[] = [];
  async findByEmail(email: string) {
    return this.rows.find((u) => u.email === email) ?? null;
  }
  async create(email: string, passwordHash: string) {
    if (this.rows.some((u) => u.email === email)) return null;
    const id = crypto.randomUUID();
    this.rows.push({ id, email, passwordHash });
    return { id };
  }
}

export class MemoryRefreshTokens extends RefreshTokenRepository {
  readonly rows: (RefreshTokenRecord & { tokenHash: string })[] = [];
  async create(input: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }) {
    this.rows.push({ id: crypto.randomUUID(), usedAt: null, revokedAt: null, ...input });
  }
  async findByHash(tokenHash: string) {
    const row = this.rows.find((r) => r.tokenHash === tokenHash);
    return row ? { ...row } : null;
  }
  async markUsed(id: string, at: Date) {
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.usedAt || row.revokedAt) return false;
    row.usedAt = at;
    return true;
  }
  async revokeFamily(familyId: string, at: Date) {
    for (const r of this.rows) if (r.familyId === familyId && !r.revokedAt) r.revokedAt = at;
  }
}

/** Reversible "hash" — only for tests; production uses argon2. */
export class PlainHasher extends PasswordHasher {
  async hash(p: string) {
    return `h:${p}`;
  }
  async verify(h: string, p: string) {
    return h === `h:${p}`;
  }
}

export class FakeAccessTokens extends AccessTokenService {
  async issue(userId: string) {
    return { token: `at:${userId}`, expiresAt: new Date('2026-11-05T12:15:00.000Z') };
  }
  async verify(token: string) {
    return token.startsWith('at:') ? token.slice(3) : null;
  }
}

export class CountingOpaqueTokens extends OpaqueTokenFactory {
  private n = 0;
  generate() {
    return `rt-${++this.n}-${'x'.repeat(24)}`;
  }
  hash(token: string) {
    return `sha:${token}`;
  }
  newId() {
    return crypto.randomUUID();
  }
}
