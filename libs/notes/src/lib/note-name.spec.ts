import { describe, expect, it } from 'vitest';
import { noteNameError } from './note-name';

describe('noteNameError', () => {
  it('accepts ordinary names', () => {
    expect(noteNameError('Ideas')).toBeUndefined();
    expect(noteNameError('Reunión 2024-05')).toBeUndefined();
  });

  it('requires a name', () => {
    expect(noteNameError('')).toBe('note.nameRequired');
    expect(noteNameError('   ')).toBe('note.nameRequired');
  });

  it.each([
    'a/b',
    'a\\b',
    'a:b',
    'a*b',
    'a?b',
    'a"b',
    'a<b',
    'a>b',
    'a|b',
    'a#b',
    'a[b',
    'a]b',
    'a\u0001b',
    '.hidden',
    'trailing.',
    'trailing ',
    ' leading',
    'CON',
    'nul',
    'COM1',
    'lpt9.txt',
    'x'.repeat(121),
  ])('rejects %j', (name) => {
    expect(noteNameError(name)).toBe('note.nameInvalid');
  });

  it('accepts the maximum length', () => {
    expect(noteNameError('x'.repeat(120))).toBeUndefined();
  });
});
