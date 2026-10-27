import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { IndexerService } from './indexer-service';

let root: string;

const write = (name: string, lines: string[]) =>
  writeFileSync(join(root, 'src', name), lines.join('\n') + '\n');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'indexer-service-'));
  mkdirSync(join(root, 'src'));
  write('callee.ts', ['export function work() {', '  return 1;', '}']);
  write('caller.ts', [
    "import { work } from './callee';",
    "import { later } from './later';",
    'export class Box extends Base {}',
    'export function run() {',
    '  return work();',
    '}',
  ]);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

type Db = SqliteClient['Service'];

const session = <A, E>(
  program: (
    db: Db,
    index: () => Effect.Effect<void, unknown>,
  ) => Effect.Effect<A, E>,
): Promise<A> => {
  const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
  const base = Layer.merge(platform, SqliteClient.layer(':memory:'));
  const layer = Layer.provide(IndexerService.layer, base).pipe(
    Layer.provideMerge(base),
  );
  return Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteClient;
      const service = yield* IndexerService;
      return yield* program(db, () => service.indexProject(root));
    }).pipe(Effect.provide(layer), Effect.scoped) as Effect.Effect<A, never>,
  );
};

const count = (db: Db, table: string) =>
  db
    .get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
    .pipe(Effect.map((row) => row?.n ?? 0));

describe('IndexerService write path', () => {
  it('keeps the untouched caller resolved after the callee changes', async () => {
    const result = await session((db, index) =>
      Effect.gen(function* () {
        yield* index();
        write('callee.ts', [
          'export function work() {',
          '  return 2;',
          '}',
          'export function extra() {}',
        ]);
        yield* index();
        const imports = yield* db.all<{
          target_path: string | null;
          target_module: string | null;
        }>(
          "SELECT target_path, target_module FROM imports WHERE specifier = './callee'",
        );
        const calls = yield* db.all<{ name: string; enclosing: string | null }>(
          `SELECT o.name, s.name AS enclosing FROM occurrences o
             LEFT JOIN symbols s ON s.id = o.enclosing_symbol_id
            WHERE o.role = 'call'`,
        );
        const relations = yield* db.all<{ target_name: string; kind: string }>(
          'SELECT target_name, kind FROM relations',
        );
        return { imports, calls, relations };
      }),
    );
    expect(result.imports).toEqual([
      { target_path: 'src/callee.ts', target_module: 'src/callee' },
    ]);
    expect(result.calls).toContainEqual({ name: 'work', enclosing: 'run' });
    expect(result.relations).toEqual([
      { target_name: 'Base', kind: 'extends' },
    ]);
  });

  it('removes rows of a deleted file', async () => {
    const counts = await session((db, index) =>
      Effect.gen(function* () {
        yield* index();
        unlinkSync(join(root, 'src', 'caller.ts'));
        yield* index();
        return {
          imports: yield* count(db, 'imports'),
          occurrences: yield* count(db, 'occurrences'),
          relations: yield* count(db, 'relations'),
        };
      }),
    );
    expect(counts).toEqual({ imports: 0, occurrences: 0, relations: 0 });
  });

  it('fills target_path when the imported file is added later', async () => {
    const target = await session((db, index) =>
      Effect.gen(function* () {
        yield* index();
        const before = yield* db.get<{ target_path: string | null }>(
          "SELECT target_path FROM imports WHERE specifier = './later'",
        );
        expect(before?.target_path).toBeNull();
        write('later.ts', ['export function later() {}']);
        yield* index();
        return yield* db.get<{
          target_path: string | null;
          target_module: string | null;
        }>(
          "SELECT target_path, target_module FROM imports WHERE specifier = './later'",
        );
      }),
    );
    expect(target).toEqual({
      target_path: 'src/later.ts',
      target_module: 'src/later',
    });
  });
});
