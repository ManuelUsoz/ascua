import { describe, expect, it } from 'vitest';
import { QueryUtil, moduleKeyOf, resolveSpecifier } from './query-util';

const SOURCE = `
export function top() {
  return 1;
}

const arrow = () => 2;

@Component({})
export class Box {
  handler = () => 3;

  open() {
    return 4;
  }
}

abstract class Base {
  abstract run(): void;
  stop() {}
}
`;

describe('QueryUtil', () => {
  it('lists functions, classes and methods with 1-based line ranges', async () => {
    const found = await QueryUtil.definitionsInSource(SOURCE);
    expect(
      found.map(({ kind, name, owner, startLine, endLine }) => [
        kind,
        name,
        owner,
        startLine,
        endLine,
      ]),
    ).toEqual([
      ['function', 'top', undefined, 2, 4],
      ['function', 'arrow', undefined, 6, 6],
      ['class', 'Box', undefined, 9, 15],
      ['method', 'handler', 'Box', 10, 10],
      ['method', 'open', 'Box', 12, 14],
      ['class', 'Base', undefined, 17, 20],
      ['method', 'stop', 'Base', 19, 19],
    ]);
  });

  it('reads import and re-export rows', async () => {
    const rows = await QueryUtil.importsInSource(`
import def from './d';
import * as ns from './n';
import { a, b as c } from './m';
export * from './all';
export { x as y, z } from './r';
`);
    expect(
      rows.map((r) => [r.kind, r.localName, r.importedName, r.specifier]),
    ).toEqual([
      ['import', 'def', 'default', './d'],
      ['import', 'ns', '*', './n'],
      ['import', 'a', 'a', './m'],
      ['import', 'c', 'b', './m'],
      ['reexport', null, '*', './all'],
      ['reexport', 'y', 'x', './r'],
      ['reexport', 'z', 'z', './r'],
    ]);
  });

  it('reads occurrences with roles, qualifiers and enclosing definitions', async () => {
    const found = await QueryUtil.occurrencesInSource(`
import { X, f } from './m';
function run() {
  f();
  new X();
  ns.g();
  obj.m();
  return value;
}
let t: Thing;
`);
    expect(
      found.map((o) => [o.role, o.name, o.qualifier, o.enclosing?.name]),
    ).toEqual([
      ['call', 'f', undefined, 'run'],
      ['new', 'X', undefined, 'run'],
      ['ref', 'ns', undefined, 'run'],
      ['call', 'g', 'ns', 'run'],
      ['ref', 'obj', undefined, 'run'],
      ['call', 'm', 'obj', 'run'],
      ['ref', 'value', undefined, 'run'],
      ['ref', 't', undefined, undefined],
      ['type', 'Thing', undefined, undefined],
    ]);
  });

  it('captures interface members owned by the interface', async () => {
    const defs = await QueryUtil.definitionsInSource(
      'interface Shape { indexProject(root: string): void; size: number; each: () => void }',
    );
    expect(
      defs.filter((d) => d.kind === 'method').map((d) => [d.name, d.owner]),
    ).toEqual([
      ['indexProject', 'Shape'],
      ['each', 'Shape'],
    ]);
  });

  it('classifies bindings and infers receiver types', async () => {
    const found = await QueryUtil.occurrencesInSource(`
class Svc {
  run(index: number, typed: IndexerService) {
    const local = 1;
    const service = yield* IndexerService;
    const made = new Other();
    local + index;
    typed.indexProject();
    service.indexProject();
    made.indexProject();
    (yield* IndexerService).indexProject();
    this.api.indexProject();
    return IndexerService.of({ indexProject, other: 1 });
  }
}
`);
    const binding = (name: string) =>
      found.filter((o) => o.name === name).map((o) => o.binding);
    expect(binding('local')).toEqual(['local', 'local']);
    expect(binding('index')).toEqual(['param', 'param']);
    expect(binding('indexProject').slice(-1)).toEqual([undefined]);
    const receivers = found
      .filter((o) => o.role === 'call' && o.name === 'indexProject')
      .map((o) => o.receiverType);
    expect(receivers).toEqual([
      'IndexerService',
      'IndexerService',
      'Other',
      'IndexerService',
      undefined,
    ]);
  });

  it('reads extends and implements', async () => {
    const [cls] = await QueryUtil.definitionsInSource(
      'class B extends ns.A<T> implements I, J {}',
    );
    expect(cls.extends).toEqual([{ name: 'A', qualifier: 'ns' }]);
    expect(cls.implements).toEqual([{ name: 'I' }, { name: 'J' }]);
  });

  it('reads satisfies from both variable forms', async () => {
    const defs = await QueryUtil.definitionsInSource(
      'const a = { x: 1 } satisfies I;\nconst b: ns.J = { x: 1 };',
    );
    const vars = defs.filter((d) => d.kind === 'variable');
    expect(vars.map((d) => [d.name, d.satisfies])).toEqual([
      ['a', [{ name: 'I' }]],
      ['b', [{ name: 'J', qualifier: 'ns' }]],
    ]);
  });

  it('ignores members of type literals and data properties', async () => {
    const defs = await QueryUtil.definitionsInSource(
      "type E = { type: 'a'; turn: string } | { type: 'b'; run(): void };\ninterface I { name: string; send: (x: string) => void; stop(): void }",
    );
    expect(defs.map((d) => [d.kind, d.name, d.owner])).toEqual([
      ['interface', 'I', undefined],
      ['method', 'send', 'I'],
      ['method', 'stop', 'I'],
    ]);
  });

  it('captures interfaces and their extends', async () => {
    const defs = await QueryUtil.definitionsInSource(
      'interface J extends I, ns.K<T> { m(): void }',
    );
    const iface = defs.find((d) => d.kind === 'interface');
    expect(iface?.name).toBe('J');
    expect(iface?.extends).toEqual([
      { name: 'I' },
      { name: 'K', qualifier: 'ns' },
    ]);
  });

  it('resolves relative specifiers', () => {
    const known = new Set([
      'src/a.ts',
      'src/b/index.ts',
      'src/c.tsx',
      'src/d.ts',
    ]);
    const from = 'src/main.ts';
    expect(resolveSpecifier(from, './a', known)).toBe('src/a.ts');
    expect(resolveSpecifier(from, './b', known)).toBe('src/b/index.ts');
    expect(resolveSpecifier(from, './c', known)).toBe('src/c.tsx');
    expect(resolveSpecifier(from, './d.js', known)).toBe('src/d.ts');
    expect(resolveSpecifier('src/b/x.ts', '../a', known)).toBe('src/a.ts');
    expect(resolveSpecifier(from, 'rxjs', known)).toBeNull();
    expect(resolveSpecifier(from, './missing', known)).toBeNull();
  });

  it('derives module keys', () => {
    expect(moduleKeyOf('src/a/b.ts')).toBe('src/a/b');
    expect(moduleKeyOf('src\\a.tsx')).toBe('src/a');
  });

  it('indexes a real file', async () => {
    const found = await QueryUtil.definitionsInFile(
      'apps/indexer/src/query-util.ts',
    );
    expect(found).toContainEqual(
      expect.objectContaining({ kind: 'class', name: 'QueryUtil' }),
    );
  });
});
