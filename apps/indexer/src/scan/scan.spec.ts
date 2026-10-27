import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { IndexerService } from '../index/indexer-service';
import { ParserUtil } from '../parser-util';
import { changedFiles } from './changed-files';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'indexer-scan-'));
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'gen'));
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, '.gitignore'), 'gen/\n*.skip.ts\n');
  writeFileSync(join(root, 'src', 'a.ts'), 'export function a() {}\n');
  writeFileSync(join(root, 'src', 'b.ts'), 'export class B {\n  go() {}\n}\n');
  writeFileSync(join(root, 'src', 'x.skip.ts'), 'function x() {}\n');
  writeFileSync(join(root, 'gen', 'g.ts'), 'function g() {}\n');
  writeFileSync(join(root, 'node_modules', 'n.ts'), 'function n() {}\n');
  writeFileSync(join(root, 'src', 'notes.md'), '# hi\n');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const layer = Layer.mergeAll(platform, SqliteClient.layer(':memory:')).pipe(
  (base) => Layer.merge(base, Layer.provide(IndexerService.layer, base)),
);

const run = <A, E>(
  program: Effect.Effect<A, E, Layer.Success<typeof layer>>,
): Promise<A> =>
  Effect.runPromise(
    program.pipe(Effect.provide(layer), Effect.scoped) as Effect.Effect<
      A,
      never
    >,
  );

describe('scanner', () => {
  it('skips ignored files and re-emits only edits', async () => {
    const result = await run(
      Effect.gen(function* () {
        const indexer = yield* IndexerService;
        const first = yield* changedFiles(root);
        yield* indexer.indexProject(root);
        const second = yield* changedFiles(root);
        writeFileSync(join(root, 'src', 'a.ts'), 'export function a2() {}\n');
        const third = yield* changedFiles(root);
        return { first, second, third };
      }),
    );
    expect(result.first.changed.map((f) => f.path)).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
    expect(result.second.changed).toEqual([]);
    expect(result.third.changed.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('does not follow symlink cycles', async () => {
    try {
      symlinkSync(root, join(root, 'src', 'loop'), 'junction');
    } catch {
      return; // symlink creation not permitted here
    }
    const result = await run(changedFiles(root));
    expect(result.changed.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('reports skipped files on stderr and in the progress line', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {
      return undefined;
    });
    vi.spyOn(ParserUtil, 'parseFile').mockRejectedValueOnce(new Error('boom'));
    try {
      await run(
        Effect.gen(function* () {
          const indexer = yield* IndexerService;
          yield* indexer.indexProject(root);
        }),
      );
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.at(-1)).toBe('{"done":2,"total":2,"skipped":1}');
      expect(String(error.mock.calls[0]?.[0])).toContain('src/a.ts');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('stores the owner of methods and removes deleted files', async () => {
    const rows = await run(
      Effect.gen(function* () {
        const db = yield* SqliteClient;
        const indexer = yield* IndexerService;
        yield* indexer.indexProject(root);
        const methods = yield* db.all<{ name: string; owner: string | null }>(
          "SELECT name, owner FROM symbols WHERE kind = 'method'",
        );
        rmSync(join(root, 'src', 'a.ts'));
        yield* indexer.indexProject(root);
        const files = yield* db.all<{ path: string }>(
          'SELECT path FROM files ORDER BY path',
        );
        return { methods, files };
      }),
    );
    expect(rows.methods).toEqual([{ name: 'go', owner: 'B' }]);
    expect(rows.files).toEqual([{ path: 'src/b.ts' }]);
  });
});
