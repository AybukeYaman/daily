import { randomUUID } from 'node:crypto';
import type { OpResult, PullResponse, PushOp } from '@daily/shared';
import { type HistoryApi, NetworkError, type SyncApi } from '../../apps/mobile/src/core/application/ports';
import { migrate } from '../../apps/mobile/src/core/infrastructure/sql/migrations';
import { SqliteEntryStore } from '../../apps/mobile/src/core/infrastructure/sqlite-entry-store';
import { SqliteSyncStore } from '../../apps/mobile/src/core/infrastructure/sqlite-sync-store';
import { HistoryService } from '../../apps/mobile/src/features/journaling/application/history-service';
import { JournalService } from '../../apps/mobile/src/features/journaling/application/journal-service';
import { SyncEngine } from '../../apps/mobile/src/features/synchronization/application/sync-engine';
import { GetEntryVersionUseCase, ListEntryVersionsUseCase } from '../../apps/api/src/modules/entries/application/version-history.use-cases';
import { PullChangesUseCase } from '../../apps/api/src/modules/sync/application/pull-changes.use-case';
import { PushChangesUseCase } from '../../apps/api/src/modules/sync/application/push-changes.use-case';
import {
  DirectTransactionRunner,
  FixedClock,
  MemoryEntries,
  MemoryOpLog,
  MemorySequence,
  MemoryVersions,
} from '../../apps/api/src/test/in-memory';
import { openNodeDatabase } from './node-sql-database';

/** The real server application layer, in memory. Wire format goes through JSON like over HTTP. */
export class TestServer {
  readonly clock = new FixedClock();
  readonly entries = new MemoryEntries(this.clock);
  readonly versions = new MemoryVersions(this.clock);
  private readonly push = new PushChangesUseCase(
    this.entries,
    this.versions,
    new MemoryOpLog(),
    new MemorySequence(),
    new DirectTransactionRunner(),
    this.clock,
  );
  private readonly pull = new PullChangesUseCase(this.entries);
  private readonly listVersions = new ListEntryVersionsUseCase(this.versions);
  private readonly getVersion = new GetEntryVersionUseCase(this.versions);

  historyApi(userId: string): HistoryApi {
    const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    return {
      list: async (entryId) => wire(await this.listVersions.execute(userId, entryId)),
      get: async (entryId, revision) => wire(await this.getVersion.execute(userId, entryId, revision)),
    };
  }

  api(userId: string, net: { online: boolean; dropResponses?: boolean }): SyncApi {
    const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    return {
      push: async (ops: PushOp[]): Promise<OpResult[]> => {
        if (!net.online) throw new NetworkError('offline');
        const results = await this.push.execute(userId, wire(ops));
        if (net.dropResponses) throw new NetworkError('response lost'); // applied on server, client never hears
        return wire(results);
      },
      pull: async (since: number): Promise<PullResponse> => {
        if (!net.online) throw new NetworkError('offline');
        return wire(await this.pull.execute(userId, { since, limit: 200 }));
      },
    };
  }
}

export async function createDevice(server: TestServer, userId: string) {
  const db = openNodeDatabase();
  const caps = await migrate(db);
  const ids = { uuid: () => randomUUID() };
  const clock = { now: () => new Date() };
  const net = { online: true, dropResponses: false };
  const kv = new Map<string, string>();
  const syncStore = new SqliteSyncStore(db, ids, clock);
  const engine = new SyncEngine(
    syncStore,
    server.api(userId, net),
    { get: async (k) => kv.get(k) ?? null, set: async (k, v) => void kv.set(k, v) },
    clock,
    () => true,
  );
  const entries = new SqliteEntryStore(db, ids, clock, caps.fts5);
  const journal = new JournalService(entries, { kick: () => undefined }, clock);
  const history = new HistoryService(server.historyApi(userId), journal);
  return { db, net, engine, journal, history, entries, syncStore };
}
