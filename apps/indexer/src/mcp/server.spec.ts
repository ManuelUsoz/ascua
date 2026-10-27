import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Cause, Effect, Exit, Layer, Stream } from 'effect';
import { Tool } from 'effect/ai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { IndexerService } from '../index/indexer-service';
import { MetricsService } from '../metrics/metrics-service';
import { QueryService } from '../query/query-service';
import { handlers, IndexerToolkit, ONLY_TS } from './server';

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
  params: Record<string, string | number | boolean>,
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

  it('tells an unsupported language from a missing file', async () => {
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        return [
          yield* callFull('get_file_outline', { path: 'tools/hook.mjs' }),
          yield* callFull('get_file_outline', { path: 'src/nope.ts' }),
          yield* callFull('find_importers', { target: 'tools/hook.mjs' }),
        ];
      }),
    );
    expect(String(out[0][0].result)).toContain('unsupported language');
    expect(String(out[1][0].result)).toContain('is not in the index');
    expect(String(out[2][0].result)).toContain('unsupported language');
  });

  it('does not report a dotted symbol ref as unsupported language', async () => {
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        return yield* callFull('find_importers', { target: 'Owner.name' });
      }),
    );
    expect(String(out[0].result)).not.toContain('unsupported language');
  });

  it('accepts file/path aliases and a leading ./', async () => {
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        return [
          yield* callFull('get_file_outline', { file: './src/a.ts' }),
          yield* callFull('find_importers', { path: './src/a.ts' }),
        ];
      }),
    );
    expect(out[0][0].isFailure).toBe(false);
    expect(String(out[0][0].result)).toContain('parseThing');
    expect(out[1][0].isFailure).toBe(false);
  });

  it('search_symbols and get_symbol_context accept the new options', async () => {
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        return [
          yield* call('search_symbols', {
            query: 'parse',
            kind: 'class',
            excludeSpecs: true,
          }),
          yield* callFull('get_symbol_context', {
            symbol: 'parseThing',
            signatureOnly: true,
          }),
        ];
      }),
    );
    expect(JSON.parse(out[0][0] as string).hits).toEqual([]);
    expect(String(out[1][0].result)).not.toContain('return 1');
  });

  it.each([
    'find_references',
    'find_callers',
    'find_callees',
    'find_implementations',
  ] as const)('%s reports an unknown symbol as an error', async (tool) => {
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        const toolkit = yield* IndexerToolkit;
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            const stream = yield* toolkit.handle(tool, {
              symbol: 'NoSuchThing',
            } as never);
            return yield* Stream.runCollect(stream as Stream.Stream<unknown>);
          }),
        );
        return Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : '';
      }),
    );
    expect(out).toContain('No indexed symbol matches "NoSuchThing"');
  });

  it('accepts the typed filters', async () => {
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        const toolkit = yield* IndexerToolkit;
        const handle = (name: string, params: Record<string, unknown>) =>
          Effect.gen(function* () {
            const stream = yield* toolkit.handle(
              name as never,
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
          yield* handle('search_symbols', { query: 'parse', owner: 'X' }),
          yield* handle('find_references', {
            symbol: 'parseThing',
            role: 'call',
            within: 'src',
            excludeSpecs: true,
          }),
          yield* handle('find_callers', {
            symbol: 'parseThing',
            within: 'src',
            excludeSpecs: true,
          }),
          yield* handle('find_callees', {
            symbol: 'parseThing',
            onlyResolved: true,
          }),
          yield* handle('find_implementations', {
            symbol: 'parseThing',
            relation: 'extends',
          }),
          yield* handle('find_importers', {
            target: 'src/a.ts',
            within: 'src',
            excludeSpecs: true,
          }),
        ];
      }),
    );
    expect(JSON.parse(out[0]).hits).toEqual([]);
    expect(JSON.parse(out[1]).hits).toEqual([]);
  });

  it('states the TypeScript-only scope in every tool description', () => {
    const tools = Object.values(IndexerToolkit.tools);
    expect(tools.length).toBeGreaterThan(8);
    for (const t of tools) expect(t.description).toContain(ONLY_TS);
  });

  it('unknown symbol errors point to search_text', async () => {
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        return yield* callFull('get_symbol_context', { symbol: 'Nope' });
      }),
    );
    expect(String(out[0].result)).toContain('search_text');
  });

  it('search_text finds class fields and reports invalid regex', async () => {
    writeFileSync(
      join(root, 'src', 'f.ts'),
      'export class Panel {\n  readonly open = signal(false);\n}\n',
    );
    const out = await run(
      MetricsService.layer,
      Effect.gen(function* () {
        const toolkit = yield* IndexerToolkit;
        const handle = (params: Record<string, unknown>) =>
          Effect.gen(function* () {
            const exit = yield* Effect.exit(
              Effect.gen(function* () {
                const stream = yield* toolkit.handle(
                  'search_text',
                  params as never,
                );
                return yield* Stream.runCollect(
                  stream as Stream.Stream<unknown>,
                );
              }),
            );
            if (Exit.isFailure(exit)) {
              const failure = exit.cause.reasons.find(Cause.isFailReason);
              expect(Cause.hasDies(exit.cause)).toBe(false);
              return String(failure?.error);
            }
            return String(
              (Array.from(exit.value as Iterable<{ result: unknown }>)[0] ?? {})
                .result,
            );
          });
        return [
          yield* handle({ pattern: 'open = signal' }),
          yield* handle({ pattern: '(', regex: true }),
          (yield* (yield* MetricsService).totals())
            .filter((t) => t.tool === 'search_text')
            .map((t) => t.calls),
        ];
      }),
    );
    expect(out[2]).toEqual([2]);
    expect(String(out[1])).toMatch(/^Invalid pattern: /);
    expect(JSON.parse(out[0]).hits[0]).toMatchObject({
      p: 'src/f.ts',
      l: 2,
      e: 'Panel',
    });
    expect(out[1]).toContain('Invalid pattern');
  });

  it('keeps the JSON schema small: no null unions nor Infinity', () => {
    const schemas = JSON.stringify(
      Object.values(IndexerToolkit.tools).map((t) => Tool.getJsonSchema(t)),
    );
    expect(schemas).not.toContain('Infinity');
    expect(schemas).not.toContain('"null"');
    expect(schemas).toContain('"extends"');
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
