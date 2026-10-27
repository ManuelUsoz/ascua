import { describe, expect, it } from 'vitest';
import { QueryUtil } from './query-util';

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

  it('indexes a real file', async () => {
    const found = await QueryUtil.definitionsInFile(
      'apps/indexer/src/query-util.ts',
    );
    expect(found).toContainEqual(
      expect.objectContaining({ kind: 'class', name: 'QueryUtil' }),
    );
  });
});
