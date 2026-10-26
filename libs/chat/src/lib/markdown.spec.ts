import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('parses fences with and without lang', () => {
    expect(parseMarkdown('```ts\nconst a = 1;\n```\n~~~\nx\n~~~')).toEqual([
      { kind: 'code', lang: 'ts', text: 'const a = 1;' },
      { kind: 'code', lang: '', text: 'x' },
    ]);
  });

  it('runs an unclosed fence to the end', () => {
    expect(parseMarkdown('```js\nlet a')).toEqual([
      { kind: 'code', lang: 'js', text: 'let a' },
    ]);
  });

  it('keeps path:line in inline code', () => {
    expect(parseMarkdown('see `a/b.ts:12` now')).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'see ' },
          { kind: 'code', text: 'a/b.ts:12' },
          { kind: 'text', text: ' now' },
        ],
      },
    ]);
  });

  it('nests strong and em', () => {
    const [b] = parseMarkdown('**a *b* c**');
    expect(b).toEqual({
      kind: 'paragraph',
      inlines: [
        {
          kind: 'strong',
          children: [
            { kind: 'text', text: 'a ' },
            { kind: 'em', children: [{ kind: 'text', text: 'b' }] },
            { kind: 'text', text: ' c' },
          ],
        },
      ],
    });
  });

  it('parses unordered and ordered lists', () => {
    const [u, o] = parseMarkdown('- a\n- b\n\n1. x\n2. y');
    expect(u).toMatchObject({ kind: 'list', ordered: false });
    expect((u as { items: unknown[] }).items).toHaveLength(2);
    expect(o).toMatchObject({ kind: 'list', ordered: true });
    expect((o as { items: unknown[] }).items).toHaveLength(2);
  });

  it('parses a table', () => {
    const [t] = parseMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(t).toMatchObject({ kind: 'table' });
    const tb = t as { head: unknown[]; rows: unknown[][] };
    expect(tb.head).toHaveLength(2);
    expect(tb.rows).toHaveLength(1);
  });

  it('degrades javascript: links to text', () => {
    expect(parseMarkdown('[x](javascript:alert)')[0]).toEqual({
      kind: 'paragraph',
      inlines: [{ kind: 'text', text: 'x' }],
    });
    expect(parseMarkdown('[ok](https://a.dev)')[0]).toMatchObject({
      inlines: [{ kind: 'link', href: 'https://a.dev' }],
    });
  });

  it('keeps raw html literal', () => {
    expect(parseMarkdown('<b>hola</b>')).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', text: '<b>hola</b>' }] },
    ]);
  });

  it('parses headings, quotes and rules', () => {
    const b = parseMarkdown('## T\n> q\n---');
    expect(b.map((x) => x.kind)).toEqual(['heading', 'quote', 'rule']);
  });
});
