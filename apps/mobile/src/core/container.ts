import { HistoryService } from '../features/journaling/application/history-service';
import { JournalService } from '../features/journaling/application/journal-service';
import { SessionManager } from '../features/authentication/application/session-manager';
import { SyncEngine } from '../features/synchronization/application/sync-engine';
import { HttpAuthApi, HttpHistoryApi, HttpSyncApi } from './infrastructure/http-apis';
import { HttpClient } from './infrastructure/http-client';
import { expoIds, SecureSessionStore, SqliteKeyValueStore, systemClock } from './infrastructure/platform-adapters';
import { openExpoDatabase } from './infrastructure/sql/expo-sql-database';
import { hasSearchIndex, migrate } from './infrastructure/sql/migrations';
import { SqliteEntryStore } from './infrastructure/sqlite-entry-store';
import { SqliteSyncStore } from './infrastructure/sqlite-sync-store';

export interface AppContainer {
  journal: JournalService;
  history: HistoryService;
  sync: SyncEngine;
  session: SessionManager;
}

const API_URL = `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'}/v1`;

/** Composition root: the only place that knows which implementation backs which port. */
export async function createContainer(): Promise<AppContainer> {
  const db = await openExpoDatabase('daily.db');
  const caps = await migrate(db);
  const fullTextSearch = caps.fts5 && (await hasSearchIndex(db));

  const session = new SessionManager(new HttpAuthApi(new HttpClient(API_URL)), new SecureSessionStore(), systemClock);
  const syncHttp = new HttpClient(API_URL, session, () => session.expire());
  const sync = new SyncEngine(
    new SqliteSyncStore(db, expoIds, systemClock),
    new HttpSyncApi(syncHttp),
    new SqliteKeyValueStore(db),
    systemClock,
    () => session.isSignedIn(),
  );
  const journal = new JournalService(new SqliteEntryStore(db, expoIds, systemClock, fullTextSearch), sync, systemClock);

  const history = new HistoryService(new HttpHistoryApi(syncHttp), journal);

  await session.init();
  await sync.init();
  session.signedIn.subscribe(() => void sync.syncNow());
  void sync.syncNow();
  void journal.purgeOldTrash();

  return { journal, history, sync, session };
}
