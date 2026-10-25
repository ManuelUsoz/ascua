import { describe, expect, it } from 'vitest';
import { mergeCommands, nxyMode, parseCommand } from './commands';

describe('mergeCommands', () => {
  it('puts builtin and nxy first and dedupes custom by name', () => {
    const out = mergeCommands([
      { name: 'make', source: 'custom' },
      { name: 'foo', source: 'custom' },
      { name: 'foo', source: 'custom', description: 'dup' },
    ]);
    expect(out.map((c) => c.name)).toEqual([
      'clear',
      'locate',
      'make',
      'review',
      'foo',
    ]);
    expect(out.find((c) => c.name === 'make')?.source).toBe('nxy');
  });

  it('is idempotent', () => {
    const once = mergeCommands([{ name: 'foo', source: 'custom' }]);
    expect(mergeCommands(once)).toEqual(once);
  });
});

describe('parseCommand', () => {
  it('returns undefined without a leading slash', () => {
    expect(parseCommand('hello /make')).toBeUndefined();
  });

  it('parses a bare command', () => {
    expect(parseCommand('/make')).toEqual({ name: 'make', args: '' });
  });

  it('parses args trimmed', () => {
    expect(parseCommand('/make  do x  ')).toEqual({
      name: 'make',
      args: 'do x',
    });
  });
});

describe('nxyMode', () => {
  it('maps /make with no args', () => {
    expect(nxyMode('/make')).toEqual({ mode: 'make', prompt: '' });
  });

  it('maps /make with args', () => {
    expect(nxyMode('/make do x')).toEqual({ mode: 'make', prompt: 'do x' });
  });

  it('ignores unknown names and plain text', () => {
    expect(nxyMode('/foo bar')).toBeUndefined();
    expect(nxyMode('make it')).toBeUndefined();
  });
});
