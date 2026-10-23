import { toSideBySide } from './side-by-side';

describe('toSideBySide', () => {
  it('numbers context lines on both sides', () => {
    const [h] = toSideBySide('@@ -3,2 +5,2 @@\n a\n b');
    expect(h.left.map((l) => l.n)).toEqual([3, 4]);
    expect(h.right.map((l) => l.n)).toEqual([5, 6]);
    expect(h.left[0]).toEqual({ n: 3, text: 'a', kind: 'ctx' });
  });

  it('pairs del and add runs and pads the shorter side', () => {
    const [h] = toSideBySide('@@ -1,3 +1,2 @@\n-a\n-b\n-c\n+x\n+y');
    expect(h.left.map((l) => l.kind)).toEqual(['del', 'del', 'del']);
    expect(h.right.map((l) => l.kind)).toEqual(['add', 'add', 'pad']);
    expect(h.right[0]).toEqual({ n: 1, text: 'x', kind: 'add' });
    expect(h.right[2].n).toBeUndefined();
  });

  it('handles a pure add (new file) and ignores no-newline markers', () => {
    const [h] = toSideBySide(
      '@@ -0,0 +1,2 @@\n+one\n+two\n\\ No newline at end of file',
    );
    expect(h.left.map((l) => l.kind)).toEqual(['pad', 'pad']);
    expect(h.right.map((l) => l.text)).toEqual(['one', 'two']);
  });

  it('adds no row for a trailing newline', () => {
    const [h] = toSideBySide('@@ -1,2 +1,2 @@\n-a\n+b\n c\n');
    expect(h.left.map((l) => l.kind)).toEqual(['del', 'ctx']);
    expect(h.right.map((l) => l.kind)).toEqual(['add', 'ctx']);
  });

  it('splits hunks and keeps the header context', () => {
    const hunks = toSideBySide(
      '@@ -1,1 +1,1 @@ fn a\n-x\n+y\n@@ -10,1 +10,1 @@ fn b\n z',
    );
    expect(hunks).toHaveLength(2);
    expect(hunks[0].context).toBe('fn a');
    expect(hunks[1].context).toBe('fn b');
    expect(hunks[1].left[0].n).toBe(10);
  });
});
