import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Cause, Effect, Exit, Layer, Stream } from 'effect';
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
  name:
    | 'search_symbols'
    | 'get_file_outline'
    | 'get_symbol_context'
    | 'find_importers',
  params: Record<string, string | number>,
) =>
  Effect.gen(function* () {
    const toolkit = yield* IndexerToolkit;
    const stream = yield* toolkit.handle(name, params as never);
    const results = yield* Stream.runCollect(stream as Stream.Stream<unknown>);
    return Array.from(results as Iterable<{ result: unknown }>).map(
      (r) => r.result,
    );
  });

const callFull = (
  name: Parameters<typeof call>[0],
  params: Parameters<typeof call>[1],
) =>
  Effect.gen(function* () {
    const toolkit = yield* IndexerToolkit;
    const exit = yield* Effect.exit(
      Effect.gen(function* () {
        const stream = yield* toolkit.handle(name, params as never);
        return yield* Stream.runCollect(stream as Stream.Stream<unknown>);
      }),
    );
    if (Exit.isFailure(exit)) {
      return [{ result: String(Cause.squash(exit.cause)), isFailure: true }];
    }
    return Array.from(
      exit.value as Iterable<{ result: unknown; isFailure: boolean }>,
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

  it('exposes the cross-file tools', () => {
    expect(Object.keys(IndexerToolkit.tools)).toEqual(
      expect.arrayContaining([
        'find_references',
        'find_callers',
        'find_callees',
        'find_importers',
        'find_implementations',
      ]),
    );
  });

  it.each([
    ['get_file_outline', { path: 'src/nope.ts' }, 'src/nope.ts'],
    ['get_symbol_context', { symbol: 'nopeSymbol' }, 'nopeSymbol'],
    ['get_symbol_context', { symbol: 99999 }, '99999'],
    ['find_importers', { target: 'src\\nope.ts' }, 'src\\nope.ts'],
  ] as const)(
    '%s reports unknown input as an error',
    async (tool, params, named) => {
      const out = await run(
        MetricsService.layer,
        callFull(tool, params as Record<string, string | number>),
      );
      expect(out[0].isFailure).toBe(true);
      expect(String(out[0].result)).toContain(named);
    },
  );

  it.each([[''], ['   ']])(
    'search_symbols rejects blank query %j',
    async (q) => {
      const out = await run(
        MetricsService.layer,
        callFull('search_symbols', { query: q }),
      );
      expect(out[0].isFailure).toBe(true);
      expect(String(out[0].result)).toContain('Query must not be empty.');
    },
  );

  it('find_references accepts includeUnresolved', async () => {
    writeFileSync(
      join(root, 'src', 'b.ts'),
      'export function f(x: any) {\n  x.go();\n}\nexport function go() {}\n',
    );
    const withFlag = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        const toolkit = yield* IndexerToolkit;
        const handle = (params: Record<string, unknown>) =>
          Effect.gen(function* () {
            const stream = yield* toolkit.handle(
              'find_references',
              params as never,
            );
            const res = yield* Stream.runCollect(
              stream as Stream.Stream<unknown>,
            );
            return String(
              (Array.from(res as Iterable<{ result: unknown }>)[0] ?? {})
                .result,
            );
          });
        return [
          yield* handle({ symbol: 'go' }),
          yield* handle({ symbol: 'go', includeUnresolved: true }),
        ];
      }),
    );
    expect(withFlag[0]).toContain('omitted');
    expect(withFlag[1]).not.toContain('"omitted"');
  });

  it('get_symbol_context accepts a numeric id from search_symbols', async () => {
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        const [found] = yield* call('search_symbols', { query: 'parseThing' });
        const id = (JSON.parse(found as string) as { hits: { id: number }[] })
          .hits[0].id;
        return yield* callFull('get_symbol_context', { symbol: id });
      }),
    );
    expect(out[0].isFailure).toBe(false);
    expect(String(out[0].result)).toContain('parseThing');
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
