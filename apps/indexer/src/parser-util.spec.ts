import { describe, expect, it } from 'vitest';
import { ParserUtil } from './parser-util';

describe('ParserUtil', () => {
  it('picks the grammar from the file extension', () => {
    expect(ParserUtil.grammarOf('a.ts')).toBe('typescript');
    expect(ParserUtil.grammarOf('a.TSX')).toBe('tsx');
    expect(ParserUtil.canParse('a.js')).toBe(false);
  });

  it('parses typescript without errors', async () => {
    const tree = await ParserUtil.parseSource('export function a() {}');
    expect(tree.rootNode.hasError).toBe(false);
    tree.delete();
  });

  it('parses tsx with the tsx grammar', async () => {
    const tree = await ParserUtil.parseSource('const a = <div />;', 'tsx');
    expect(tree.rootNode.hasError).toBe(false);
    tree.delete();
  });

  it('refuses unsupported files', async () => {
    await expect(ParserUtil.parseFile('a.py')).rejects.toThrow('unsupported');
  });
});
