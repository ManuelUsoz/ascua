import { describe, expect, it } from 'vitest';
import { languageFor, lineSeparatorFor } from './editor-model';

describe('languageFor', () => {
  it('maps extensions', () => {
    expect(languageFor('src/a.ts')).toBe('typescript');
    expect(languageFor('a.TSX')).toBe('typescript');
    expect(languageFor('a.mjs')).toBe('javascript');
    expect(languageFor('package.json')).toBe('json');
    expect(languageFor('x/index.htm')).toBe('html');
    expect(languageFor('a.css')).toBe('css');
    expect(languageFor('README.md')).toBe('markdown');
  });

  it('returns undefined for unknown or extensionless files', () => {
    expect(languageFor('Makefile')).toBeUndefined();
    expect(languageFor('a.d/readme')).toBeUndefined();
    expect(languageFor('a.txt')).toBeUndefined();
  });
});

describe('lineSeparatorFor', () => {
  it('uses the first line break', () => {
    expect(lineSeparatorFor('a\r\nb\nc')).toBe('\r\n');
    expect(lineSeparatorFor('a\nb\r\nc')).toBe('\n');
    expect(lineSeparatorFor('abc')).toBe('\n');
  });
});
