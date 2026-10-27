import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { IndexerService } from '../index/indexer-service';
import { QueryService } from './query-service';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'indexer-query-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'src', 'a.ts'),
    [
      'export function parseThing() {',
      '  return 1;',
      '}',
      'export function parseThingHelper() {}',
      'export class Parser {',
      '  parse() {}',
      '  reset() {}',
      '}',
      '',
    ].join('\n'),
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const run = <A, E>(
  program: (q: QueryService['Service']) => Effect.Effect<A, E>,
): Promise<A> => {
  const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
  const base = Layer.merge(platform, SqliteClient.layer(':memory:'));
  const layer = Layer.merge(
    Layer.provide(IndexerService.layer, base),
    Layer.provide(QueryService.layer(root), base),
  ).pipe(Layer.provideMerge(base));
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* (yield* IndexerService).indexProject(root);
      return yield* program(yield* QueryService);
    }).pipe(Effect.provide(layer), Effect.scoped) as Effect.Effect<A, never>,
  );
};

describe('QueryService', () => {
  it('ranks the exact name first', async () => {
    const hits = await run((q) => q.searchSymbols('parseThing'));
    expect(hits[0].n).toBe('parseThing');
    expect(hits.map((h) => h.n)).toContain('parseThingHelper');
  });

  it('honours the token budget', async () => {
    const hits = await run((q) => q.searchSymbols('parse', { maxTokens: 30 }));
    const all = await run((q) => q.searchSymbols('parse'));
    expect(all.length).toBeGreaterThan(hits.length);
    expect(
      hits.reduce((n, h) => n + Math.ceil(JSON.stringify(h).length / 4), 0),
    ).toBeLessThanOrEqual(30);
  });

  it('nests methods under their class in the outline', async () => {
    const outline = await run((q) => q.fileOutline('src/a.ts'));
    const cls = outline.find((n) => n.n === 'Parser');
    expect(cls?.m?.map((m) => m.n)).toEqual(['parse', 'reset']);
    expect(outline.some((n) => n.n === 'parse')).toBe(false);
  });

  it('returns capped source for a symbol', async () => {
    const full = await run((q) => q.symbolContext('parseThing'));
    expect(full?.src).toContain('return 1;');
    const cut = await run((q) =>
      q.symbolContext('parseThing', { maxTokens: 8 }),
    );
    expect(cut?.truncated).toBe(true);
  });
});
