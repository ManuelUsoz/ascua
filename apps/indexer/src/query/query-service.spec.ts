import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { IndexerService } from '../index/indexer-service';
import { QueryService, toFtsQuery } from './query-service';

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

const files = (entries: Record<string, string>) => {
  for (const [p, text] of Object.entries(entries)) {
    writeFileSync(join(root, 'src', p), text);
  }
};

describe('QueryService cross-file', () => {
  beforeEach(() => {
    files({
      'lib.ts':
        'export function foo() {}\nexport class A {}\nexport interface I {}\n',
      'b.ts':
        "import { foo } from './lib';\nexport function useB() {\n  foo();\n}\n",
      'c.ts':
        "import * as ns from './lib';\nexport function useC() {\n  ns.foo();\n}\n",
      'd.ts':
        "import { A, I } from './lib';\nexport class B extends A implements I {}\nexport function mk() {\n  return new B();\n}\n",
      'index.ts': "export * from './lib';\n",
      'e.ts':
        "import { foo } from './index';\nexport function useE() {\n  foo();\n}\n",
      'x.ts': "export * from './y';\n",
      'y.ts': "export * from './x';\n",
      'z.ts':
        "import { nope } from './x';\nexport function useZ() {\n  nope();\n}\n",
      'p.ts': 'export function dup() {}\n',
      'q.ts': 'export function dup() {}\n',
      'bar.ts': "export * from './p';\nexport * from './q';\n",
      'f.ts':
        "import { dup } from './bar';\nexport function useF() {\n  dup();\n}\n",
    });
  });

  it('finds callers through named, namespace and barrel imports', async () => {
    const { hits: callers } = await run((q) => q.findCallers('foo'));
    expect(callers.map((c) => c.n).sort()).toEqual(['useB', 'useC', 'useE']);
  });

  it('finds references and instantiations', async () => {
    const { hits: refs } = await run((q) => q.findReferences('B'));
    expect(refs.some((r) => r.r === 'new' && r.e === 'mk')).toBe(true);
  });

  it('finds callees with their resolution', async () => {
    const callees = await run((q) => q.findCallees('useB'));
    expect(callees[0].to?.[0].p).toBe('src/lib.ts');
  });

  it('finds implementations', async () => {
    const impls = await run((q) => q.findImplementations('A'));
    expect(impls.map((i) => [i.n, i.rel])).toContainEqual(['B', 'extends']);
    const ifaces = await run((q) => q.findImplementations('I'));
    expect(ifaces.map((i) => [i.n, i.rel])).toContainEqual(['B', 'implements']);
  });

  it('resolves implements to the interface definition and its extenders', async () => {
    files({
      'j.ts': "import { I } from './lib';\nexport interface J extends I {}\n",
    });
    const ifaces = await run((q) => q.findImplementations('I'));
    const b = ifaces.find((i) => i.n === 'B');
    expect(b?.rel).toBe('implements');
    expect(b?.u).toBeUndefined();
    expect(ifaces.map((i) => [i.n, i.rel])).toContainEqual(['J', 'extends']);
  });

  it('keeps distinct unresolved targets distinct', async () => {
    files({
      'u1.ts': 'export class U1 implements Ghost1 {}\n',
      'u2.ts': 'export class U2 implements Ghost2 {}\n',
    });
    const g1 = await run((q) => q.findImplementations('Ghost1'));
    const g2 = await run((q) => q.findImplementations('Ghost2'));
    expect(g1.map((i) => i.n)).toEqual(['U1']);
    expect(g2.map((i) => i.n)).toEqual(['U2']);
    expect(g1[0].u).toBe(true);
    expect(g2[0].u).toBe(true);
  });

  it('lists barrel consumers as indirect importers', async () => {
    const importers = await run((q) => q.findImporters('src/lib.ts'));
    const e = importers.find((i) => i.p === 'src/e.ts');
    expect(e?.indirect).toBe(true);
    expect(importers.find((i) => i.p === 'src/b.ts')?.indirect).toBeUndefined();
  });

  it('terminates on mutual export * cycles', async () => {
    const { hits: callers } = await run((q) =>
      q.findCallers('nope', { includeUnresolved: true }),
    );
    expect(callers.length).toBeGreaterThan(0);
    expect(callers.every((c) => c.u === true)).toBe(true);
  });

  it('flags ambiguous resolution through two wildcards', async () => {
    const { hits: callers } = await run((q) => q.findCallers('dup'));
    const f = callers.find((c) => c.n === 'useF');
    expect(f?.a).toBe(true);
  });

  it('honours the token budget', async () => {
    const all = await run((q) => q.findReferences('foo'));
    const cut = await run((q) => q.findReferences('foo', { maxTokens: 20 }));
    expect(all.hits.length).toBeGreaterThan(cut.hits.length);
  });
});

describe('QueryService receiver resolution', () => {
  beforeEach(() => {
    files({
      'svc.ts': [
        'interface IndexerServiceShape {',
        '  indexProject(root: string): void;',
        '  index(root: string): void;',
        '}',
        'export class IndexerService extends Context.Tag("x")<IndexerService, IndexerServiceShape>() {',
        '  static layer() {',
        '    const indexProject = (root: string) => root;',
        '    const index = (root: string) => root;',
        '    return IndexerService.of({ indexProject, index });',
        '  }',
        '}',
        '',
      ].join('\n'),
      'use.ts': [
        'export function typed(service: IndexerService) {',
        '  service.indexProject("a");',
        '}',
        'export function viaYield() {',
        '  return (yield* IndexerService).indexProject("b");',
        '}',
        'export function boundYield() {',
        '  const service = yield* IndexerService;',
        '  service.indexProject("c");',
        '}',
        'export function locals(index: number) {',
        '  const other = index + 1;',
        '  return other;',
        '}',
        'export function useIdx(service: IndexerService) {',
        '  const index = 0;',
        '  service.index("r");',
        '  return index;',
        '}',
        '',
      ].join('\n'),
      'other.ts': [
        'interface Api { indexProject(id: string): void }',
        'export class Other {',
        '  api!: Api;',
        '  go(unknown: any) {',
        '    this.api.indexProject("x");',
        '    unknown.indexProject("y");',
        '  }',
        '}',
        '',
      ].join('\n'),
    });
  });

  it('finds receiver-typed callers without name-only matches', async () => {
    const { hits: callers } = await run((q) => q.findCallers('indexProject'));
    const real = callers.filter((c) => c.u !== true);
    expect(real.map((c) => c.n).sort()).toEqual(
      expect.arrayContaining(['typed', 'boundYield', 'viaYield']),
    );
    const viaYield = callers.find((c) => c.n === 'viaYield');
    expect(viaYield).toBeDefined();
    expect(viaYield?.u).toBeUndefined();
    expect(real.map((c) => c.n)).not.toContain('go');
    // unknown receiver loses to resolved callers by default
    expect(callers.some((c) => c.n === 'go')).toBe(false);
    const full = await run((q) =>
      q.findCallers('indexProject', { includeUnresolved: true }),
    );
    const go = full.hits.filter((c) => c.n === 'go');
    expect(go).toHaveLength(1);
    expect(go[0].u).toBe(true);
    const lastResolved = full.hits.map((c) => c.u !== true).lastIndexOf(true);
    const firstUnresolved = full.hits.findIndex((c) => c.u === true);
    expect(firstUnresolved).toBeGreaterThan(lastResolved);
    const dflt = await run((q) => q.findCallers('indexProject'));
    expect(dflt.omitted).toBeGreaterThan(0);
  });

  it('keeps a lone unknown-receiver call as unresolved', async () => {
    files({
      'only.ts': [
        'export function lone(unknown: any) {',
        '  unknown.soloMethod("y");',
        '}',
        'export class Holder { soloMethod() {} }',
        '',
      ].join('\n'),
    });
    const { hits } = await run((q) => q.findCallers('soloMethod'));
    expect(hits).toHaveLength(1);
    expect(hits[0].n).toBe('lone');
    expect(hits[0].u).toBe(true);
  });

  it('excludes locals and params and hides short unresolved names', async () => {
    const { hits: refs } = await run((q) => q.findReferences('index'));
    expect(refs.some((r) => r.e === 'locals')).toBe(false);
    expect(refs.some((r) => r.r === 'call' && r.e === 'useIdx')).toBe(true);
    const all = await run((q) =>
      q.findReferences('index', { includeUnresolved: true }),
    );
    expect(all.hits.length).toBeGreaterThanOrEqual(refs.length);
    expect(all.omitted).toBeUndefined();
  });
});

describe('QueryService shorthand and key bindings', () => {
  beforeEach(() => {
    files({
      'svc.ts': [
        'export class Svc {',
        '  index(root: string) { return root; }',
        '  indexProject(root: string) { return root; }',
        '}',
        '',
      ].join('\n'),
      'use.ts': [
        'import { indexProject } from "./svc";',
        'export function shorthandUser() {',
        '  return { indexProject };',
        '}',
        'export function pairKey() {',
        '  return { index: 1 };',
        '}',
        'export function memberProp(obj: { index: number }) {',
        '  return obj.index;',
        '}',
        '',
      ].join('\n'),
    });
  });

  it('keeps shorthand value references and excludes keys and properties', async () => {
    const { hits: proj } = await run((q) => q.findReferences('indexProject'));
    expect(proj.some((r) => r.e === 'shorthandUser')).toBe(true);
    const { hits: idx } = await run((q) =>
      q.findReferences('index', { includeUnresolved: true }),
    );
    expect(idx.some((r) => r.e === 'pairKey')).toBe(false);
    expect(idx.some((r) => r.e === 'memberProp')).toBe(false);
  });
});

describe('QueryService exported arrow functions', () => {
  beforeEach(() => {
    files({
      'geometry.ts':
        'export const avatarRect = (w: number) => ({ w });\n' +
        'export function one() {\n  return avatarRect(1);\n}\n' +
        'export function two() {\n  return avatarRect(2);\n}\n',
      'geometry.spec.ts':
        "import { avatarRect } from './geometry';\nexport function t() {\n  avatarRect(3);\n}\n",
      'engine.ts':
        'export function avatarSize() {}\nexport interface AssistantEngine {}\nexport class Impl implements AssistantEngine {}\n',
    });
  });

  it('finds callers and references', async () => {
    const { hits: callers } = await run((q) => q.findCallers('avatarRect'));
    expect(callers.map((c) => c.n).sort()).toEqual(['one', 't', 'two']);
    const { hits: refs } = await run((q) => q.findReferences('avatarRect'));
    expect(refs.length).toBeGreaterThan(0);
  });

  it('finds importers by path and by name', async () => {
    const byPath = await run((q) => q.findImporters('src/geometry.ts'));
    expect(byPath.map((i) => i.p)).toContain('src/geometry.spec.ts');
    const byName = await run((q) => q.findImporters('avatarRect'));
    expect(byName.map((i) => i.p)).toContain('src/geometry.spec.ts');
  });

  it('finds implementations and exported interfaces', async () => {
    const impls = await run((q) => q.findImplementations('AssistantEngine'));
    expect(impls.map((i) => [i.n, i.rel])).toContainEqual([
      'Impl',
      'implements',
    ]);
    const { hits } = await run((q) => q.searchSymbols('AssistantEngine'));
    expect(hits[0].n).toBe('AssistantEngine');
  });

  it('prefix-matches every token', async () => {
    const { hits } = await run((q) => q.searchSymbols('avatar'));
    expect(hits.map((h) => h.n)).toContain('avatarRect');
    expect(toFtsQuery('avatar rec')).toBe('"avatar"* "rec"*');
  });

  it('keeps one hit and reports truncation under a tiny budget', async () => {
    const r = await run((q) => q.searchSymbols('avatar', { maxTokens: 5 }));
    expect(r.hits).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });
});

describe('QueryService', () => {
  it('ranks the exact name first', async () => {
    const { hits } = await run((q) => q.searchSymbols('parseThing'));
    expect(hits[0].n).toBe('parseThing');
    expect(hits.map((h) => h.n)).toContain('parseThingHelper');
  });

  it('honours the token budget', async () => {
    const { hits } = await run((q) =>
      q.searchSymbols('parse', { maxTokens: 30 }),
    );
    const { hits: all } = await run((q) => q.searchSymbols('parse'));
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
