import { JournalService } from '../features/journaling/application/journal-service';
import { SessionManager } from '../features/authentication/application/session-manager';
import { SyncEngine } from '../features/synchronization/application/sync-engine';
import { HttpAuthApi, HttpSyncApi } from './infrastructure/http-apis';
import { HttpClient } from './infrastructure/http-client';
import { expoIds, SecureSessionStore, SqliteKeyValueStore, systemClock } from './infrastructure/platform-adapters';
import { openExpoDatabase } from './infrastructure/sql/expo-sql-database';
import { migrate } from './infrastructure/sql/migrations';
import { SqliteEntryStore } from './infrastructure/sqlite-entry-store';
import { SqliteSyncStore } from './infrastructure/sqlite-sync-store';

export interface AppContainer {
  journal: JournalService;
  sync: SyncEngine;
  session: SessionManager;
}

const API_URL = `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'}/v1`;

/** Composition root: the only place that knows which implementation backs which port. */
export async function createContainer(): Promise<AppContainer> {
  const db = await openExpoDatabase('daily.db');
  await migrate(db);

  const session = new SessionManager(new HttpAuthApi(new HttpClient(API_URL)), new SecureSessionStore(), systemClock);
  const syncHttp = new HttpClient(API_URL, session, () => session.expire());
  const sync = new SyncEngine(
    new SqliteSyncStore(db, expoIds, systemClock),
    new HttpSyncApi(syncHttp),
    new SqliteKeyValueStore(db),
    systemClock,
    () => session.isSignedIn(),
  );
  const journal = new JournalService(new SqliteEntryStore(db, expoIds, systemClock), sync, systemClock);

  await session.init();
  await sync.init();
  session.signedIn.subscribe(() => void sync.syncNow());
  void sync.syncNow();

  return { journal, sync, session };
}
