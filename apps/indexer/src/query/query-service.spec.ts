import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { IndexerService } from '../index/indexer-service';
import {
  type Ambiguous,
  type CalleeHit,
  type ImporterHit,
  QueryService,
  toFtsQuery,
} from './query-service';

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
    const callees = (await run((q) => q.findCallees('useB'))) as CalleeHit[];
    expect(callees[0].to?.[0].p).toBe('src/lib.ts');
  });

  it('finds implementations', async () => {
    const impls = await run((q) => q.findImplementations('A'));
    expect(impls.extends?.map((i) => i.n)).toContain('B');
    const ifaces = await run((q) => q.findImplementations('I'));
    expect(ifaces.implements?.map((i) => i.n)).toContain('B');
  });

  it('groups satisfies, implements and extends separately', async () => {
    files({
      's.ts':
        "import { I } from './lib';\nexport const viaSat = { a: 1 } satisfies I;\nexport const viaAnn: I = { a: 1 };\n",
    });
    const ifaces = await run((q) => q.findImplementations('I'));
    expect(ifaces.satisfies?.map((i) => i.n).sort()).toEqual([
      'viaAnn',
      'viaSat',
    ]);
    expect(ifaces.implements?.map((i) => i.n)).toEqual(['B']);
    expect(ifaces.extends).toBeUndefined();
  });

  it('resolves tsconfig path aliases, including wildcards', async () => {
    writeFileSync(
      join(root, 'tsconfig.base.json'),
      '{ // comment\n "compilerOptions": { "baseUrl": ".", "paths": { "@x/lib": ["src/index.ts",], "@x/deep/*": ["src/*"] } } }',
    );
    files({
      'al.ts':
        "import { I } from '@x/lib';\nimport { A } from '@x/deep/lib';\nexport class C extends A implements I {}\n",
    });
    const refs = await run((q) => q.findReferences('I'));
    const hit = refs.hits.find((h) => h.p === 'src/al.ts');
    expect(hit).toBeDefined();
    expect(hit?.u).toBeUndefined();
    const impls = await run((q) => q.findImplementations('I'));
    expect(impls.implements?.find((i) => i.n === 'C')?.u).toBeUndefined();
    const importers = await run((q) => q.findImporters('src/lib.ts'));
    expect(JSON.stringify(importers)).toContain('src/al.ts');
  });

  it('finds importers by alias and by package specifier', async () => {
    writeFileSync(
      join(root, 'tsconfig.base.json'),
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "@x/lib": ["src/lib.ts"] } } }',
    );
    files({
      'al.ts': "import { foo } from '@x/lib';\nexport const v = foo;\n",
      'rx.ts': "import { map } from 'rxjs';\nexport const m = map;\n",
    });
    const byAlias = (await run((q) =>
      q.findImporters('@x/lib'),
    )) as ImporterHit[];
    expect(byAlias.map((i) => i.p)).toContain('src/al.ts');
    expect(byAlias.map((i) => i.p)).toContain('src/b.ts');
    const byPkg = (await run((q) => q.findImporters('rxjs'))) as ImporterHit[];
    expect(byPkg.map((i) => i.p)).toEqual(['src/rx.ts']);
    const bySymbol = (await run((q) =>
      q.findImporters('foo'),
    )) as ImporterHit[];
    expect(bySymbol.map((i) => i.p)).toContain('src/b.ts');
  });

  it('does not index primitive or generic typed object consts as symbols', async () => {
    files({
      'u.ts':
        'export const rec: Record<string, number> = { a: 1 };\nexport const plain: { a: number } = { a: 1 };\n',
    });
    const hits = await run((q) => q.searchSymbols('rec'));
    expect(JSON.stringify(hits)).not.toContain('"rec"');
    const plain = await run((q) => q.searchSymbols('plain'));
    expect(JSON.stringify(plain)).not.toContain('"plain"');
  });

  it('resolves implements to the interface definition and its extenders', async () => {
    files({
      'j.ts': "import { I } from './lib';\nexport interface J extends I {}\n",
    });
    const ifaces = await run((q) => q.findImplementations('I'));
    const b = ifaces.implements?.find((i) => i.n === 'B');
    expect(b?.rel).toBe('implements');
    expect(b?.u).toBeUndefined();
    expect(ifaces.extends?.map((i) => i.n)).toContain('J');
  });

  it('keeps distinct unresolved targets distinct', async () => {
    files({
      'u1.ts': 'export class U1 implements Ghost1 {}\n',
      'u2.ts': 'export class U2 implements Ghost2 {}\n',
    });
    const g1 = await run((q) => q.findImplementations('Ghost1'));
    const g2 = await run((q) => q.findImplementations('Ghost2'));
    expect(g1.implements?.map((i) => i.n)).toEqual(['U1']);
    expect(g2.implements?.map((i) => i.n)).toEqual(['U2']);
    expect(g1.implements?.[0].u).toBe(true);
    expect(g2.implements?.[0].u).toBe(true);
  });

  it('lists barrel consumers as indirect importers', async () => {
    const importers = (await run((q) =>
      q.findImporters('src/lib.ts'),
    )) as ImporterHit[];
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

describe('QueryService symbol refs', () => {
  beforeEach(() => {
    files({
      'one.ts':
        'export function helper() {}\nexport class One {\n  open() {\n    helper();\n  }\n  field = helper();\n}\n',
      'two.ts': 'export class Two {\n  open() {}\n}\n',
    });
  });

  it('returns candidates for an ambiguous name', async () => {
    const ctx = await run((q) => q.symbolContext('open'));
    expect(ctx).toHaveProperty('candidates');
    const c = (ctx as { candidates: { o?: string; p: string }[] }).candidates;
    expect(c.map((x) => [x.o, x.p]).sort()).toEqual([
      ['One', 'src/one.ts'],
      ['Two', 'src/two.ts'],
    ]);
    const { candidates } = await run((q) => q.findCallers('open'));
    expect(candidates).toHaveLength(2);
  });

  it('resolves Owner.name and path#name', async () => {
    const byOwner = await run((q) => q.symbolContext('Two.open'));
    expect(byOwner).toMatchObject({ n: 'open', p: 'src/two.ts' });
    const byPath = await run((q) => q.symbolContext('src/one.ts#open'));
    expect(byPath).toMatchObject({ n: 'open', p: 'src/one.ts' });
    const callers = await run((q) => q.findCallers('One.open'));
    expect(callers.candidates).toBeUndefined();
  });

  it('gathers the callees of a class members', async () => {
    const callees = (await run((q) => q.findCallees('One'))) as CalleeHit[];
    expect(callees.map((c) => [c.from, c.o, c.n])).toContainEqual([
      'open',
      'One',
      'helper',
    ]);
  });

  it('returns candidates for callees, importers and implementations', async () => {
    const callees = await run((q) => q.findCallees('open'));
    expect(Array.isArray(callees)).toBe(false);
    expect((callees as Ambiguous).candidates).toHaveLength(2);
    const importers = await run((q) => q.findImporters('open'));
    expect((importers as Ambiguous).candidates).toHaveLength(2);
    const impls = await run((q) => q.findImplementations('open'));
    expect(impls.candidates).toHaveLength(2);
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
    const byPath = (await run((q) =>
      q.findImporters('src/geometry.ts'),
    )) as ImporterHit[];
    expect(byPath.map((i) => i.p)).toContain('src/geometry.spec.ts');
    const byName = (await run((q) =>
      q.findImporters('avatarRect'),
    )) as ImporterHit[];
    expect(byName.map((i) => i.p)).toContain('src/geometry.spec.ts');
  });

  it('finds implementations and exported interfaces', async () => {
    const impls = await run((q) => q.findImplementations('AssistantEngine'));
    expect(impls.implements?.map((i) => i.n)).toContain('Impl');
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

describe('QueryService nested arrow in call', () => {
  it('finds a caller inside an arrow-valued const passed into a call', async () => {
    files({
      'errors.ts':
        'export function toAssistantError(e: unknown) { return e; }\n',
      'ipc.ts':
        "import { toAssistantError } from './errors';\n" +
        'declare const ipcMain: any;\n' +
        'declare function encodeError(e: unknown): unknown;\n' +
        'export function register() {\n' +
        '  const guarded = (fn: any) => async (...a: any[]) => {\n' +
        '    try {\n      return await fn(...a);\n' +
        '    } catch (e) {\n      return encodeError(toAssistantError(e));\n    }\n  };\n' +
        "  ipcMain.handle('x', guarded(() => 1));\n}\n",
    });
    const { hits } = await run((q) => q.findCallers('toAssistantError'));
    expect(hits.map((c) => c.n)).toContain('guarded');
  });

  it('finds a caller inside a generic async function, within new Error(...)', async () => {
    files({
      'ipc2.ts':
        'declare function encodeError(e: unknown): string;\n' +
        'export function toAssistantError(e: unknown) { return e; }\n' +
        'async function guarded<T>(work: () => Promise<T> | T): Promise<T> {\n' +
        '  try {\n    return await work();\n' +
        '  } catch (error) {\n' +
        '    throw new Error(encodeError(toAssistantError(error)));\n  }\n}\n' +
        'export function reg(ipc: any) {\n' +
        "  ipc.handle('x', () => guarded(() => 1));\n}\n",
    });
    const { hits } = await run((q) => q.findCallers('toAssistantError'));
    expect(hits.map((c) => c.n)).toContain('guarded');
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

  it('signatureOnly and maxLines cap the returned source', async () => {
    const sig = await run((q) =>
      q.symbolContext('parseThing', { signatureOnly: true }),
    );
    expect(sig?.src).toBe('export function parseThing() {');
    const two = await run((q) =>
      q.symbolContext('parseThing', { maxLines: 2 }),
    );
    expect(two?.src.split('\n')).toHaveLength(2);
  });

  it('search_symbols filters by kind, path prefix and specs', async () => {
    files({ 'a.spec.ts': 'export function parseSpecHelper() {}\n' });
    const names = (r: { hits: { n: string }[] }) => r.hits.map((h) => h.n);
    const all = await run((q) => q.searchSymbols('parse'));
    expect(names(all)).toContain('parseSpecHelper');
    const noSpecs = await run((q) =>
      q.searchSymbols('parse', { excludeSpecs: true }),
    );
    expect(names(noSpecs)).not.toContain('parseSpecHelper');
    const classes = await run((q) =>
      q.searchSymbols('parse', { kind: 'class' }),
    );
    expect(names(classes)).toEqual(['Parser']);
    const none = await run((q) => q.searchSymbols('parse', { path: 'nope/' }));
    expect(none.hits).toEqual([]);
    const some = await run((q) => q.searchSymbols('parse', { path: './src/' }));
    expect(some.hits.length).toBeGreaterThan(0);
  });

  it('normalizes a leading ./ in paths', async () => {
    const outline = await run((q) => q.fileOutline('./src/a.ts'));
    expect(outline?.length).toBeGreaterThan(0);
  });

  it('matches a multi-word query against a camelCase name', async () => {
    files({ 'ptt.ts': 'export class PushToTalk {}\n' });
    const { hits } = await run((q) => q.searchSymbols('push to talk'));
    expect(hits.map((h) => h.n)).toContain('PushToTalk');
  });

  it('reports truncated on list results cut by the budget', async () => {
    files({
      'lib.ts': 'export function foo() {}\n',
      'u1.ts': "import { foo } from './lib';\nfoo();\nfoo();\nfoo();\n",
      'u2.ts': "import { foo } from './lib';\nfoo();\nfoo();\nfoo();\n",
    });
    const cut = await run((q) => q.findReferences('foo', { maxTokens: 10 }));
    expect(cut.truncated).toBe(true);
    const all = await run((q) => q.findReferences('foo'));
    expect(all?.truncated).toBeUndefined();
  });
});

describe('QueryService ranking, scopes and unknown symbols', () => {
  it('ranks search hits: exact name and code before members and specs', async () => {
    files({
      'm.ts': 'export class Mailer {\n  send() {}\n}\n',
      'm.spec.ts': 'export function send() {}\n',
      'f.ts': 'export function sendAll() {}\nexport function send() {}\n',
    });
    const { hits } = await run((q) => q.searchSymbols('send'));
    expect(hits[0]).toMatchObject({ n: 'send', p: 'src/f.ts' });
    expect(hits[hits.length - 1].p).toBe('src/m.spec.ts');
  });

  it('search_symbols filters by owner', async () => {
    files({
      'm.ts':
        'export class A {\n  send() {}\n}\nexport class B {\n  send() {}\n}\n',
    });
    const { hits } = await run((q) => q.searchSymbols('send', { owner: 'B' }));
    expect(hits.map((h) => h.o)).toEqual(['B']);
  });

  it('sorts candidates by rank and caps them with moreCandidates', async () => {
    files({
      'm.ts': 'export class Mailer {\n  send() {}\n}\n',
      'm.spec.ts': 'export function send() {}\n',
    });
    const amb = await run((q) => q.symbolContext('send'));
    const cands = (amb as Ambiguous).candidates;
    expect(cands[cands.length - 1].p).toBe('src/m.spec.ts');
    for (let i = 0; i < 12; i++) {
      files({ [`d${i}.ts`]: 'export function dupe() {}\n' });
    }
    const many = (await run((q) => q.symbolContext('dupe'))) as Ambiguous;
    expect(many.candidates).toHaveLength(10);
    expect(many.moreCandidates).toBe(2);
  });

  it('returns undefined for unknown symbols, empty hits for defined ones', async () => {
    files({ 'k.ts': 'export function lonely() {}\nexport class Lone {}\n' });
    const [r, c, ce, im, known] = await run((q) =>
      Effect.all([
        q.findReferences('NoSuchThing'),
        q.findCallers('NoSuchThing'),
        q.findCallees('NoSuchThing'),
        q.findImplementations('NoSuchThing'),
        q.findCallers('lonely'),
      ]),
    );
    expect([r, c, ce, im]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(known?.hits).toEqual([]);
  });

  it('keeps name-only hits only in files that import the qualified owner', async () => {
    files({
      'mailer.ts': 'export class Mailer {\n  dispatch() {}\n}\n',
      'user.ts':
        "import { Mailer } from './mailer';\nexport function a(x: any, m: Mailer) {\n  x.dispatch();\n}\n",
      'other.ts': 'export function b(x: any) {\n  x.dispatch();\n}\n',
    });
    const res = await run((q) => q.findCallers('Mailer.dispatch'));
    expect(res?.hits.map((h) => h.p)).toEqual(['src/user.ts']);
    expect(res?.hits[0].u).toBe(true);
    expect(res?.omitted).toBe(1);
  });

  it('keeps reachable name-only hits for short method names', async () => {
    files({
      'svc.ts': 'export class Svc {\n  send() {}\n}\n',
      'a.ts':
        "import { Svc } from './svc';\nexport function a(x: any, s: Svc) {\n  x.send();\n}\n",
      'b.ts': 'export function b(y: any) {\n  y.send();\n}\n',
    });
    const res = await run((q) => q.findCallers('Svc.send'));
    expect(res?.hits.map((h) => h.p)).toEqual(['src/a.ts']);
    expect(res?.hits[0].u).toBe(true);
    expect(res?.omitted).toBe(1);
  });

  it('keeps short name-only hits reached through a barrel', async () => {
    files({
      'svc.ts': 'export class Svc {\n  send() {}\n}\n',
      'index.ts': "export * from './svc';\n",
      'a.ts':
        "import { Svc } from './index';\nexport function a(x: any, s: Svc) {\n  x.send();\n}\n",
      'b.ts': 'export function b(y: any) {\n  y.send();\n}\n',
    });
    const res = await run((q) => q.findCallers('Svc.send'));
    expect(res?.hits.map((h) => h.p)).toEqual(['src/a.ts']);
    expect(res?.omitted).toBe(1);
  });

  it('role, within, excludeSpecs and relation filter results', async () => {
    files({
      'lib.ts': 'export function foo() {}\nexport class A {}\n',
      'u.ts':
        "import { foo, A } from './lib';\nexport class S extends A {}\nfoo();\nnew A();\n",
      'u.spec.ts':
        "import { foo, A } from './lib';\nexport class T extends A {}\nfoo();\n",
    });
    const calls = await run((q) => q.findReferences('A', { role: 'new' }));
    expect(calls?.hits.every((h) => h.r === 'new')).toBe(true);
    const within = await run((q) =>
      q.findReferences('foo', { within: 'src/zzz' }),
    );
    expect(within?.hits).toEqual([]);
    const noSpec = await run((q) =>
      q.findCallers('foo', { excludeSpecs: true }),
    );
    expect(noSpec?.hits.some((h) => h.p.endsWith('.spec.ts'))).toBe(false);
    const impl = await run((q) =>
      q.findImplementations('A', { relation: 'implements' }),
    );
    expect(impl?.extends).toBeUndefined();
    const implNoSpec = await run((q) =>
      q.findImplementations('A', { excludeSpecs: true }),
    );
    expect(implNoSpec?.extends?.map((i) => i.n)).toEqual(['S']);
    const imp = await run((q) =>
      q.findImporters('src/lib.ts', { within: 'src/u.ts' }),
    );
    expect((imp as ImporterHit[]).map((i) => i.p)).toEqual(['src/u.ts']);
    const imp2 = await run((q) =>
      q.findImporters('src/lib.ts', { excludeSpecs: true }),
    );
    expect((imp2 as ImporterHit[]).some((i) => i.p.endsWith('.spec.ts'))).toBe(
      false,
    );
  });

  it('onlyResolved drops unresolved callees', async () => {
    files({
      'o.ts':
        'export function host(x: any) {\n  x.mystery();\n  local();\n}\nfunction local() {}\n',
    });
    const all = (await run((q) => q.findCallees('host'))) as CalleeHit[];
    expect(all.some((c) => c.u)).toBe(true);
    const some = (await run((q) =>
      q.findCallees('host', { onlyResolved: true }),
    )) as CalleeHit[];
    expect(some.length).toBeGreaterThan(0);
    expect(some.some((c) => c.u)).toBe(false);
  });
});

describe('QueryService.searchText', () => {
  beforeEach(() => {
    files({
      'cmp.ts':
        'export class Cmp {\n  readonly open = signal(false);\n  readonly Name = signal(1);\n}\n',
      'cmp.spec.ts': 'export const t = 1;\n// open = signal(true)\n',
    });
  });

  it('finds a non-function field with its enclosing class', async () => {
    const r = await run((q) => q.searchText('open = signal'));
    const hit = r.hits.find((h) => h.p === 'src/cmp.ts');
    expect(hit).toMatchObject({ l: 2, e: 'Cmp' });
  });

  it('supports regex mode', async () => {
    const r = await run((q) =>
      q.searchText('signal\\(\\w+\\)', { regex: true, within: 'src/cmp.ts' }),
    );
    expect(r.hits.map((h) => h.l)).toEqual([2, 3]);
  });

  it('filters by within and excludeSpecs', async () => {
    const all = await run((q) => q.searchText('open = signal'));
    expect(all.hits.some((h) => h.p.endsWith('.spec.ts'))).toBe(true);
    const noSpecs = await run((q) =>
      q.searchText('open = signal', { excludeSpecs: true }),
    );
    expect(noSpecs.hits.every((h) => !h.p.endsWith('.spec.ts'))).toBe(true);
    const within = await run((q) =>
      q.searchText('open = signal', { within: 'src/cmp.spec.ts' }),
    );
    expect(within.hits.map((h) => h.p)).toEqual(['src/cmp.spec.ts']);
  });

  it('marks truncated when limit is hit', async () => {
    const r = await run((q) => q.searchText('signal', { limit: 1 }));
    expect(r.hits).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  it('fails with InvalidPattern on a bad regex', async () => {
    const r = await run((q) =>
      q.searchText('(', { regex: true }).pipe(Effect.flip),
    );
    expect(r._tag).toBe('InvalidPattern');
  });

  it('is case-insensitive unless caseSensitive', async () => {
    const i = await run((q) => q.searchText('readonly name'));
    expect(i.hits.length).toBe(1);
    const s = await run((q) =>
      q.searchText('readonly name', { caseSensitive: true }),
    );
    expect(s.hits).toHaveLength(0);
  });
});
