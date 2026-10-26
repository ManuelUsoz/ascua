import { describe, expect, it } from 'vitest';
import { lengthToMask, preprocessText, toTextIds } from './supertonic-text';

describe('preprocessText', () => {
  it('decomposes accents into base + combining mark', () => {
    const out = preprocessText('canción', 'es');
    expect(out).toBe('<es>canción.</es>');
  });

  it('strips emoji and adds a final period', () => {
    expect(preprocessText('hola 😀', 'es')).toBe('<es>hola.</es>');
  });

  it('keeps existing final punctuation and wraps per language', () => {
    expect(preprocessText('Done!', 'en')).toBe('<en>Done!</en>');
    expect(preprocessText('¿Listo?', 'es')).toBe('<es>¿Listo?</es>');
  });

  it('replaces @ only in english', () => {
    expect(preprocessText('a@b', 'en')).toBe('<en>a at b.</en>');
    expect(preprocessText('a@b', 'es')).toBe('<es>a@b.</es>');
  });

  it('normalizes symbols, spacing and quotes', () => {
    expect(preprocessText('x_y z , ok', 'en')).toBe('<en>x y z, ok.</en>');
    expect(preprocessText('“hi”', 'en')).toBe('<en>"hi"</en>');
  });
});

describe('toTextIds', () => {
  it('maps code points and uses -1 out of range', () => {
    const table = Array.from({ length: 98 }, (_, i) => (i === 97 ? 5 : 0));
    expect(toTextIds('a€', table)).toEqual([5, -1]);
  });
});

describe('lengthToMask', () => {
  it('pads with zeros', () => {
    expect(Array.from(lengthToMask(2, 4))).toEqual([1, 1, 0, 0]);
    expect(Array.from(lengthToMask(3))).toEqual([1, 1, 1]);
  });
});
