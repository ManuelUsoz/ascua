import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer, Stream } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { IndexerService } from '../index/indexer-service';
import { MetricsService } from '../metrics/metrics-service';
import { QueryService } from '../query/query-service';
import { handlers, IndexerToolkit } from './server';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'indexer-mcp-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'src', 'a.ts'),
    'export function parseThing() {\n  return 1;\n}\n',
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const base = Layer.merge(platform, SqliteClient.layer(':memory:'));

const run = <A, E>(
  metrics: Layer.Layer<MetricsService, never, SqliteClient>,
  program: Effect.Effect<A, E, MetricsService | IndexerToolkitHandlers>,
): Promise<A> => {
  const services = Layer.mergeAll(
    Layer.provide(IndexerService.layer, base),
    Layer.provide(QueryService.layer(root), base),
    metrics,
  ).pipe(Layer.provideMerge(base));
  const layer = Layer.provideMerge(handlers(undefined), services);
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* (yield* IndexerService).indexProject(root);
      return yield* program;
    }).pipe(Effect.provide(layer), Effect.scoped) as Effect.Effect<A, never>,
  );
};

type IndexerToolkitHandlers = Layer.Success<ReturnType<typeof handlers>>;

const call = (
  name: 'search_symbols' | 'get_file_outline',
  params: Record<string, string>,
) =>
  Effect.gen(function* () {
    const toolkit = yield* IndexerToolkit;
    const stream = yield* toolkit.handle(name, params as never);
    const results = yield* Stream.runCollect(stream as Stream.Stream<unknown>);
    return Array.from(results as Iterable<{ result: unknown }>).map(
      (r) => r.result,
    );
  });

describe('MCP tool instrumentation', () => {
  it('records one row per call', async () => {
    const totals = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        yield* call('search_symbols', { query: 'parse' });
        yield* call('get_file_outline', { path: 'src/a.ts' });
        return yield* (yield* MetricsService).totals();
      }),
    );
    expect(totals.map((t) => [t.tool, t.calls])).toEqual([
      ['*', 2],
      ['get_file_outline', 1],
      ['search_symbols', 1],
    ]);
  });

  it('still returns the result when recording fails', async () => {
    const failing = Layer.succeed(
      MetricsService,
      MetricsService.of({
        record: () => Effect.die('boom'),
        totals: () => Effect.succeed([]),
      }),
    );
    const out = await run(failing, call('search_symbols', { query: 'parse' }));
    expect(JSON.stringify(out)).toContain('parseThing');
  });
});
