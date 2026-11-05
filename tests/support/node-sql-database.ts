import Database from 'better-sqlite3';
import { Mutex, type SqlDatabase, type SqlExecutor, type SqlValue } from '../../apps/mobile/src/core/infrastructure/sql/sql-database';

/** better-sqlite3 implementation of the app's SqlDatabase port: same SQL engine as the device. */
export function openNodeDatabase(): SqlDatabase {
  const db = new Database(':memory:');
  const mutex = new Mutex();
  const exec: SqlExecutor = {
    async run(sql, params: SqlValue[] = []) {
      if (/^\s*PRAGMA/i.test(sql)) {
        db.pragma(sql.replace(/^\s*PRAGMA\s+/i, ''));
        return { changes: 0 };
      }
      return { changes: db.prepare(sql).run(...params).changes };
    },
    async get<T>(sql: string, params: SqlValue[] = []) {
      if (/^\s*PRAGMA/i.test(sql)) return (db.pragma(sql.replace(/^\s*PRAGMA\s+/i, '')) as T[])[0] ?? null;
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
  };
  return {
    ...exec,
    exec: async (sql) => void db.exec(sql),
    transaction: (work) =>
      mutex.lock(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = await work(exec);
          db.exec('COMMIT');
          return result;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      }),
  };
}
