import { Platform } from 'react-native';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Mutex, type SqlDatabase, type SqlExecutor, type SqlValue } from './sql-database';

type Conn = Pick<SQLiteDatabase, 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

function executor(conn: Conn): SqlExecutor {
  return {
    run: async (sql, params: SqlValue[] = []) => ({ changes: (await conn.runAsync(sql, params)).changes }),
    get: (sql, params: SqlValue[] = []) => conn.getFirstAsync(sql, params),
    all: (sql, params: SqlValue[] = []) => conn.getAllAsync(sql, params),
  };
}

export async function openExpoDatabase(name: string): Promise<SqlDatabase> {
  const db = await openDatabaseAsync(name);
  // WAL: readers never block the writer; NORMAL sync is durable across app crashes in WAL mode.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  const mutex = new Mutex();
  const root = executor(db);

  return {
    ...root,
    run: (sql, params) => mutex.lock(() => root.run(sql, params)),
    exec: (sql) => mutex.lock(() => db.execAsync(sql)),
    transaction: <T>(work: (tx: SqlExecutor) => Promise<T>) =>
      mutex.lock(async () => {
        let result!: T;
        if (Platform.OS === 'web') {
          await db.withTransactionAsync(async () => {
            result = await work(root);
          });
        } else {
          // Separate connection: statements from elsewhere cannot leak into this transaction.
          await db.withExclusiveTransactionAsync(async (txn) => {
            result = await work(executor(txn));
          });
        }
        return result;
      }),
  };
}
