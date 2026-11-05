import { SessionSchema, type Session } from '@daily/shared';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Clock, IdGenerator, KeyValueStore, SessionStore } from '../application/ports';
import type { SqlDatabase } from './sql/sql-database';

const SESSION_KEY = 'daily.session';

export const systemClock: Clock = { now: () => new Date() };
export const expoIds: IdGenerator = { uuid: () => randomUUID() };

/** Tokens live in Keychain / Android Keystore, never in SQLite or AsyncStorage. */
export class SecureSessionStore implements SessionStore {
  async load(): Promise<Session | null> {
    if (Platform.OS === 'web') return null; // web: session lives in memory only
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed = SessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  async save(session: Session | null): Promise<void> {
    if (Platform.OS === 'web') return;
    if (session) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

export class SqliteKeyValueStore implements KeyValueStore {
  constructor(private readonly db: SqlDatabase) {}

  async get(key: string): Promise<string | null> {
    return (await this.db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]))?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.run('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
      key,
      value,
    ]);
  }
}
