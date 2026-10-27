import { describe, expect, it } from 'vitest';
import { isSpecPath, Ranking, type Rankable } from './ranking';

const r = (
  name: string,
  kind = 'function',
  path = 'src/a.ts',
  owner: string | null = null,
): Rankable => ({ name, kind, path, owner });

const order = (items: Rankable[], text?: string, owner?: string) =>
  Ranking.sort(items, (x) => x, { text, owner }).map((x) => x.name);

describe('Ranking', () => {
  it('exact before prefix before substring', () => {
    expect(
      order([r('xsendx'), r('sendAll'), r('send'), r('SEND')], 'send'),
    ).toEqual(['send', 'SEND', 'sendAll', 'xsendx']);
  });

  it('declarations over members', () => {
    expect(
      order([r('send', 'method', 'src/a.ts', 'C'), r('send', 'class')], 'send'),
    ).toEqual(['send', 'send']);
    const sorted = Ranking.sort(
      [r('send', 'method', 'src/a.ts', 'C'), r('send', 'class')],
      (x) => x,
      { text: 'send' },
    );
    expect(sorted[0].kind).toBe('class');
  });

  it('code over specs', () => {
    const sorted = Ranking.sort(
      [
        r('send', 'function', 'src/a.spec.ts'),
        r('send', 'function', 'src/b.ts'),
      ],
      (x) => x,
      { text: 'send' },
    );
    expect(sorted[0].path).toBe('src/b.ts');
    expect(isSpecPath('a/b.test.tsx')).toBe(true);
    expect(isSpecPath('a/b.ts')).toBe(false);
  });

  it('boosts the requested owner', () => {
    const sorted = Ranking.sort(
      [r('send', 'method', 'a.ts', 'X'), r('send', 'method', 'b.ts', 'Y')],
      (x) => x,
      { text: 'send', owner: 'Y' },
    );
    expect(sorted[0].owner).toBe('Y');
  });

  it('ties keep input order', () => {
    expect(order([r('a1'), r('a2'), r('a3')])).toEqual(['a1', 'a2', 'a3']);
  });
});
