import type { DatabaseSync as Database } from 'node:sqlite';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

/**
 * Append-only: never edit a shipped migration, add a new one. `kind` and
 * `language` intentionally have no CHECK because their sets will grow and
 * SQLite can only widen a CHECK by rebuilding the table; TypeScript validates
 * them. Lines are 1-based and inclusive.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'files-and-symbols',
    sql: `
      CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        content_hash TEXT NOT NULL,
        language TEXT NOT NULL
      );
      CREATE TABLE symbols (
        id INTEGER PRIMARY KEY,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        start_line INTEGER NOT NULL CHECK (start_line >= 1),
        end_line INTEGER NOT NULL CHECK (end_line >= start_line),
        signature TEXT
      );
      CREATE INDEX symbols_file_id ON symbols(file_id);
      CREATE INDEX symbols_name ON symbols(name);
    `,
  },
  {
    version: 2,
    name: 'symbol-owner-and-fts',
    // FTS5 keyed by symbols.id: path lives in files, so the triggers copy it
    // into the index. Deleting a file cascades to symbols, whose delete
    // trigger removes the FTS rows. Renaming a file path is not mirrored
    // (the indexer deletes and re-inserts files).
    sql: `
      ALTER TABLE symbols ADD COLUMN owner TEXT NULL;
      CREATE VIRTUAL TABLE symbols_fts USING fts5(
        name, signature, path,
        tokenize = 'unicode61'
      );
      CREATE TRIGGER symbols_ai AFTER INSERT ON symbols BEGIN
        INSERT INTO symbols_fts (rowid, name, signature, path)
        VALUES (
          new.id, new.name, coalesce(new.signature, ''),
          (SELECT path FROM files WHERE id = new.file_id)
        );
      END;
      CREATE TRIGGER symbols_ad AFTER DELETE ON symbols BEGIN
        DELETE FROM symbols_fts WHERE rowid = old.id;
      END;
      CREATE TRIGGER symbols_au AFTER UPDATE ON symbols BEGIN
        DELETE FROM symbols_fts WHERE rowid = old.id;
        INSERT INTO symbols_fts (rowid, name, signature, path)
        VALUES (
          new.id, new.name, coalesce(new.signature, ''),
          (SELECT path FROM files WHERE id = new.file_id)
        );
      END;
    `,
  },
  {
    version: 3,
    name: 'mcp-tool-metrics',
    // started_at is epoch ms; tokens is chars/4 of the response.
    sql: `
      CREATE TABLE tool_calls (
        id INTEGER PRIMARY KEY,
        tool TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        tokens INTEGER NOT NULL,
        max_tokens INTEGER NULL,
        results INTEGER NULL,
        ok INTEGER NOT NULL,
        error TEXT NULL
      );
      CREATE INDEX tool_calls_tool_started ON tool_calls(tool, started_at);
    `,
  },
  {
    version: 4,
    name: 'occurrences-imports-relations',
    // No cross-file FKs: references are resolved by name + import target at
    // query time, so editing one file never invalidates rows of another.
    // files.module: TS = repo-relative posix path without extension.
    sql: `
      ALTER TABLE files ADD COLUMN module TEXT NULL;
      CREATE INDEX files_module ON files(module);
      CREATE TABLE imports (
        id INTEGER PRIMARY KEY,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        local_name TEXT NULL,
        imported_name TEXT NULL,
        specifier TEXT NOT NULL,
        target_path TEXT NULL,
        target_module TEXT NULL,
        line INTEGER NOT NULL
      );
      CREATE INDEX imports_file_id ON imports(file_id);
      CREATE INDEX imports_target_path ON imports(target_path);
      CREATE INDEX imports_target_module ON imports(target_module);
      CREATE INDEX imports_local_name ON imports(local_name);
      CREATE TABLE occurrences (
        id INTEGER PRIMARY KEY,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        qualifier TEXT NULL,
        role TEXT NOT NULL,
        line INTEGER NOT NULL,
        col INTEGER NOT NULL,
        enclosing_symbol_id INTEGER NULL REFERENCES symbols(id) ON DELETE SET NULL
      );
      CREATE INDEX occurrences_file_id ON occurrences(file_id);
      CREATE INDEX occurrences_name ON occurrences(name);
      CREATE INDEX occurrences_enclosing ON occurrences(enclosing_symbol_id);
      CREATE TABLE relations (
        id INTEGER PRIMARY KEY,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        symbol_id INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        target_name TEXT NOT NULL,
        target_qualifier TEXT NULL
      );
      CREATE INDEX relations_file_id ON relations(file_id);
      CREATE INDEX relations_target_name ON relations(target_name);
    `,
  },
  {
    version: 5,
    name: 'reindex-occurrences-and-imports',
    // Indexes built before references.scm/imports.scm existed hold files whose
    // hashes are unchanged, so they would never be re-parsed. Dropping the
    // files (cascading to every derived row) forces a full rebuild.
    sql: `DELETE FROM files;`,
  },
  {
    version: 6,
    name: 'occurrence-binding-and-receiver-type',
    // binding: local | param | property, NULL when the name is not a binding.
    // receiver_type: declared/inferred type of a member call's receiver.
    // Old rows keep NULLs and behave as before.
    sql: `
      ALTER TABLE occurrences ADD COLUMN binding TEXT NULL;
      ALTER TABLE occurrences ADD COLUMN receiver_type TEXT NULL;
    `,
  },
];

export const migrate = (
  db: Database,
  migrations: readonly Migration[] = MIGRATIONS,
): number => {
  migrations.forEach((m, index) => {
    if (m.version !== index + 1) {
      throw new Error(
        `migration ${m.name} has version ${m.version}, expected ${index + 1}`,
      );
    }
  });

  const current = (
    db.prepare('PRAGMA user_version').get() as { user_version: number }
  ).user_version;
  if (current > migrations.length) {
    throw new Error(
      `database is at version ${current}, newer than this indexer (${migrations.length})`,
    );
  }

  const pending = migrations.slice(current);
  for (const { sql, version } of pending) {
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return pending.length;
};
