import { describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { fileFromRow, symbolFromRow } from './models';
import type { FileRow, SymbolRow } from './models';
import { MIGRATIONS, migrate } from './migrations';

const userVersion = (db: ReturnType<typeof openDatabase>) =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number })
    .user_version;

const tableExists = (db: ReturnType<typeof openDatabase>, name: string) =>
  db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) !== undefined;

const addFile = (db: ReturnType<typeof openDatabase>, path = 'a.ts') =>
  Number(
    db
      .prepare(
        'INSERT INTO files (path, content_hash, language) VALUES (?, ?, ?)',
      )
      .run(path, 'abc', 'typescript').lastInsertRowid,
  );

const addSymbol = (
  db: ReturnType<typeof openDatabase>,
  fileId: number,
  start = 1,
  end = 2,
) =>
  db
    .prepare(
      'INSERT INTO symbols (file_id, name, kind, start_line, end_line) VALUES (?, ?, ?, ?, ?)',
    )
    .run(fileId, 'foo', 'function', start, end);

describe('migrations', () => {
  it('creates the schema', () => {
    const db = openDatabase(':memory:');
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    expect(tableExists(db, 'files')).toBe(true);
    expect(tableExists(db, 'symbols')).toBe(true);
    expect(tableExists(db, 'tool_calls')).toBe(true);
    expect(userVersion(db)).toBe(6);
  });

  it('v6 adds occurrence binding and receiver_type columns', () => {
    const db = openDatabase(':memory:');
    const columns = (
      db.prepare('PRAGMA table_info(occurrences)').all() as { name: string }[]
    ).map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining(['binding', 'receiver_type']),
    );
  });

  it('v5 clears files indexed before occurrences existed', () => {
    const db = openDatabase(':memory:');
    db.exec('PRAGMA user_version = 4');
    const id = addFile(db);
    addSymbol(db, id);
    expect(migrate(db, MIGRATIONS.slice(0, 5))).toBe(1);
    for (const t of ['files', 'symbols']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({
        n: 0,
      });
    }
  });

  it('v4 adds occurrences, imports, relations and files.module', () => {
    const db = openDatabase(':memory:');
    for (const t of ['imports', 'occurrences', 'relations']) {
      expect(tableExists(db, t)).toBe(true);
    }
    const id = addFile(db);
    db.prepare('UPDATE files SET module = ? WHERE id = ?').run('a', id);
    addSymbol(db, id);
    db.prepare(
      "INSERT INTO imports (file_id, kind, specifier, line) VALUES (?, 'import', './b', 1)",
    ).run(id);
    db.prepare(
      "INSERT INTO occurrences (file_id, name, role, line, col, enclosing_symbol_id) VALUES (?, 'f', 'call', 1, 0, 1)",
    ).run(id);
    db.prepare(
      "INSERT INTO relations (file_id, symbol_id, kind, target_name) VALUES (?, 1, 'extends', 'A')",
    ).run(id);
    db.prepare('DELETE FROM files WHERE id = ?').run(id);
    for (const t of ['imports', 'occurrences', 'relations']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()).toEqual({
        n: 0,
      });
    }
  });

  it('is idempotent', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toBe(0);
  });

  it('refuses a newer database', () => {
    const db = openDatabase(':memory:');
    db.exec('PRAGMA user_version = 99');
    expect(() => migrate(db)).toThrow('newer');
  });

  it('rejects version gaps', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      migrate(db, [{ version: 2, name: 'gap', sql: 'SELECT 1' }]),
    ).toThrow('expected 1');
  });

  it('rolls back a failing migration', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      migrate(db, [
        ...MIGRATIONS,
        {
          version: MIGRATIONS.length + 1,
          name: 'broken',
          sql: 'CREATE TABLE half (id INTEGER); SELECT * FROM nope;',
        },
      ]),
    ).toThrow();
    expect(userVersion(db)).toBe(MIGRATIONS.length);
    expect(tableExists(db, 'half')).toBe(false);
  });
});

describe('schema constraints', () => {
  it('keeps file paths unique', () => {
    const db = openDatabase(':memory:');
    addFile(db);
    expect(() => addFile(db)).toThrow(/UNIQUE/);
  });

  it('requires an existing file', () => {
    const db = openDatabase(':memory:');
    expect(() => addSymbol(db, 42)).toThrow(/FOREIGN KEY/);
  });

  it('validates line ranges', () => {
    const db = openDatabase(':memory:');
    const id = addFile(db);
    expect(() => addSymbol(db, id, 0, 1)).toThrow(/CHECK/);
    expect(() => addSymbol(db, id, 5, 4)).toThrow(/CHECK/);
  });

  it('cascades file deletion to symbols', () => {
    const db = openDatabase(':memory:');
    const id = addFile(db);
    addSymbol(db, id);
    db.prepare('DELETE FROM files WHERE id = ?').run(id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM symbols').get()).toEqual({
      n: 0,
    });
  });
});

describe('migration 2: owner and FTS', () => {
  const ftsCount = (db: ReturnType<typeof openDatabase>, q: string) =>
    (
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM symbols_fts WHERE symbols_fts MATCH ?',
        )
        .get(q) as { n: number }
    ).n;

  it('adds a nullable owner column', () => {
    const db = openDatabase(':memory:');
    const col = (
      db.prepare("PRAGMA table_info('symbols')").all() as {
        name: string;
        notnull: number;
      }[]
    ).find((c) => c.name === 'owner');
    expect(col?.notnull).toBe(0);
  });

  it('indexes inserted symbols by name and path', () => {
    const db = openDatabase(':memory:');
    addFile(db, 'src/widget.ts');
    addSymbol(db, 1);
    expect(ftsCount(db, 'foo')).toBe(1);
    expect(ftsCount(db, 'path:widget')).toBe(1);
  });

  it('follows symbol updates', () => {
    const db = openDatabase(':memory:');
    addSymbol(db, addFile(db));
    db.exec("UPDATE symbols SET name = 'bar'");
    expect(ftsCount(db, 'foo')).toBe(0);
    expect(ftsCount(db, 'bar')).toBe(1);
  });

  it('removes symbols from FTS when the file is deleted', () => {
    const db = openDatabase(':memory:');
    const id = addFile(db);
    addSymbol(db, id);
    db.prepare('DELETE FROM files WHERE id = ?').run(id);
    expect(ftsCount(db, 'foo')).toBe(0);
  });
});

describe('row mappers', () => {
  it('maps real rows', () => {
    const db = openDatabase(':memory:');
    const id = addFile(db);
    addSymbol(db, id, 3, 7);
    const file = db.prepare('SELECT * FROM files').get() as FileRow;
    const symbol = db.prepare('SELECT * FROM symbols').get() as SymbolRow;
    expect(fileFromRow(file)).toEqual({
      id,
      path: 'a.ts',
      contentHash: 'abc',
      language: 'typescript',
    });
    const mapped = symbolFromRow(symbol);
    expect(mapped).toEqual({
      id: symbol.id,
      fileId: id,
      name: 'foo',
      kind: 'function',
      startLine: 3,
      endLine: 7,
    });
    expect('signature' in mapped).toBe(false);
  });
});
