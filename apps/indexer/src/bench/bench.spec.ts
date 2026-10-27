import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import type { BenchmarkCase, BenchmarkReport } from '@ascua/ipc';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { IndexerService } from '../index/indexer-service';
import { QueryService } from '../query/query-service';
import { runBenchmark } from './bench';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'indexer-bench-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'src', 'a.ts'),
    'export function parseThing() {\n  return 1;\n}\n',
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const base = Layer.merge(platform, SqliteClient.layer(':memory:'));

const cases: BenchmarkCase[] = [
  {
    id: 'hit',
    question: 'where is parseThing',
    tool: 'search_symbols',
    args: { query: 'parseThing' },
    expectFiles: ['src/a.ts'],
    expectSymbols: ['parseThing'],
  },
  {
    id: 'half',
    question: 'where is parseThing (wrong file too)',
    tool: 'search_symbols',
    args: { query: 'parseThing' },
    expectFiles: ['src/nope.ts'],
    expectSymbols: ['parseThing'],
  },
  {
    id: 'miss',
    question: 'outline of a missing file',
    tool: 'get_file_outline',
    args: { path: 'src/none.ts' },
    expectFiles: [],
    expectSymbols: ['parseThing'],
  },
];

describe('runBenchmark', () => {
  it('scores cases, aggregates per tool and reports progress', async () => {
    const services = Layer.mergeAll(
      Layer.provide(IndexerService.layer, base),
      Layer.provide(QueryService.layer(root), base),
    ).pipe(Layer.provideMerge(base));
    const progress: { done: number; total: number }[] = [];
    const r = await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* IndexerService).indexProject(root);
        return yield* runBenchmark(cases, (p) => progress.push(p));
      }).pipe(Effect.provide(services), Effect.scoped) as Effect.Effect<
        BenchmarkReport,
        never
      >,
    );
    expect(progress).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
    expect(r.cases.map((x) => [x.id, x.hit, x.recall])).toEqual([
      ['hit', true, 1],
      ['half', true, 0.5],
      ['miss', false, 0],
    ]);
    expect(r.cases[0].tokens).toBeGreaterThan(0);
    const search = r.perTool.find((t) => t.tool === 'search_symbols');
    expect(search?.hitRate).toBe(1);
    expect(r.perTool.find((t) => t.tool === 'get_file_outline')?.hitRate).toBe(
      0,
    );
  });
});
