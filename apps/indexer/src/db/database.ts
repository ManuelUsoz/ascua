import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';

export type Database = DatabaseSync;

/** Opens (and migrates) the index database. Pass ':memory:' for tests. */
export const openDatabase = (file: string): Database => {
  const db = new DatabaseSync(file);
  // Off by default in SQLite; symbols rely on ON DELETE CASCADE.
  db.exec('PRAGMA foreign_keys = ON');
  // The MCP and index processes may write concurrently.
  db.exec('PRAGMA busy_timeout = 5000');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
};
