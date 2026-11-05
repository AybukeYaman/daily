import { backoffMs, MAX_PUSH_OPS } from '@daily/shared';
import { observable, type Observable } from '../../../core/application/observable';
import {
  AuthExpiredError,
  type Clock,
  type KeyValueStore,
  NetworkError,
  type SyncApi,
  type SyncStore,
} from '../../../core/application/ports';

export type SyncPhase = 'local-only' | 'syncing' | 'synced' | 'waiting' | 'offline' | 'failed';

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  failed: number;
  lastSyncedAt: string | null;
  /** Last unexpected (non-network) error, shown in Settings. Never contains entry content. */
  lastError: string | null;
}

const LAST_SYNC_KEY = 'sync.lastSyncedAt';
const KICK_DEBOUNCE_MS = 1_500;
const MAX_PUSH_ROUNDS = 20;

/**
 * Drains the outbox and pulls remote changes. Never blocks writing: the editor
 * only touches SQLite, and this runs afterwards, debounced and serialized.
 */
export class SyncEngine {
  readonly status: Observable<SyncStatus> = observable<SyncStatus>({
    phase: 'local-only',
    pending: 0,
    failed: 0,
    lastSyncedAt: null,
    lastError: null,
  });

  private running: Promise<void> | null = null;
  private rerun = false;
  private rerunManual = false;
  private kickTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private networkFailures = 0;

  constructor(
    private readonly store: SyncStore,
    private readonly api: SyncApi,
    private readonly kv: KeyValueStore,
    private readonly clock: Clock,
    private readonly isSignedIn: () => boolean,
  ) {}

  async init(): Promise<void> {
    const lastSyncedAt = await this.kv.get(LAST_SYNC_KEY);
    await this.refreshCounts({ lastSyncedAt, phase: this.isSignedIn() ? 'synced' : 'local-only' });
  }

  /** Call after any local write. Cheap; coalesces bursts of typing into one sync. */
  kick(): void {
    if (this.kickTimer) clearTimeout(this.kickTimer);
    this.kickTimer = setTimeout(() => {
      this.kickTimer = null;
      void this.syncNow({ manual: false });
    }, KICK_DEBOUNCE_MS);
  }

  /**
   * Runs a sync now, or once more right after the current one finishes.
   * Manual syncs (user action, app foreground, sign-in) ignore per-op backoff.
   */
  syncNow({ manual = true }: { manual?: boolean } = {}): Promise<void> {
    if (this.running) {
      this.rerun = true;
      this.rerunManual ||= manual;
      return this.running;
    }
    this.running = this.loop(manual).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async retryFailed(): Promise<void> {
    await this.store.retryFailed();
    await this.syncNow();
  }

  dispose(): void {
    if (this.kickTimer) clearTimeout(this.kickTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private async loop(manual: boolean): Promise<void> {
    for (;;) {
      await this.runOnce(manual);
      if (!this.rerun) return;
      manual = this.rerunManual;
      this.rerun = false;
      this.rerunManual = false;
    }
  }

  private async runOnce(manual: boolean): Promise<void> {
    if (!this.isSignedIn()) {
      await this.refreshCounts({ phase: 'local-only' });
      return;
    }
    this.status.set((s) => ({ ...s, phase: 'syncing' }));
    try {
      await this.push(manual);
      await this.pull();
      this.networkFailures = 0;
      const lastSyncedAt = this.clock.now().toISOString();
      await this.kv.set(LAST_SYNC_KEY, lastSyncedAt);
      const counts = await this.store.counts();
      const phase: SyncPhase = counts.failed > 0 ? 'failed' : counts.pending > 0 ? 'waiting' : 'synced';
      await this.refreshCounts({ lastSyncedAt, lastError: null, phase });
      // Ops still inside their backoff window: wake up exactly when the first one is due.
      if (counts.pending > 0) await this.scheduleAtNextDue();
    } catch (error) {
      if (error instanceof AuthExpiredError) {
        await this.refreshCounts({ phase: 'local-only' });
      } else {
        // Network or server trouble: local data is safe, try again later with backoff.
        const lastError = error instanceof NetworkError ? null : error instanceof Error ? error.message : String(error);
        await this.refreshCounts({ phase: 'offline', lastError });
        this.scheduleRetry();
      }
    }
  }

  private async push(manual: boolean): Promise<void> {
    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      const dueBy = manual ? Number.MAX_SAFE_INTEGER : this.clock.now().getTime();
      const ops = await this.store.claimBatch(dueBy, MAX_PUSH_OPS);
      if (ops.length === 0) return;
      let results;
      try {
        results = await this.api.push(ops);
      } catch (error) {
        await this.store.scheduleRetry(ops.map((o) => o.opId), this.clock.now().getTime());
        throw error;
      }
      await this.store.applyResults(results);
    }
  }

  private async pull(): Promise<void> {
    let since = await this.store.cursor();
    for (;;) {
      const page = await this.api.pull(since);
      await this.store.applyPulled(page.entries, page.cursor);
      since = page.cursor;
      if (!page.hasMore) return;
    }
  }

  private scheduleRetry(delayMs: number = backoffMs(this.networkFailures++)): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow({ manual: false });
    }, delayMs);
  }

  private async scheduleAtNextDue(): Promise<void> {
    const due = await this.store.nextDueAt();
    if (due !== null) this.scheduleRetry(Math.max(0, due - this.clock.now().getTime()));
  }

  private async refreshCounts(patch: Partial<SyncStatus>): Promise<void> {
    const counts = await this.store.counts();
    this.status.set((s) => ({ ...s, ...counts, ...patch }));
  }
}
