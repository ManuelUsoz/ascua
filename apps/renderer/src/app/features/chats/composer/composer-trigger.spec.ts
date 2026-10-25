import type { ChatCommand } from '@ascua/chat';
import { detectTrigger, rankCommands, replaceRange } from './composer-trigger';

const cmd = (name: string, description = ''): ChatCommand => ({
  name,
  source: 'custom',
  description,
});

describe('detectTrigger', () => {
  it('detects / at the text start', () => {
    expect(detectTrigger('/lo', 3)).toEqual({
      kind: 'command',
      query: 'lo',
      rangeStart: 0,
      rangeEnd: 3,
    });
  });

  it('detects / after whitespace at the cursor', () => {
    expect(detectTrigger('hola /re mundo', 8)).toEqual({
      kind: 'command',
      query: 're',
      rangeStart: 5,
      rangeEnd: 8,
    });
  });

  it('ignores slashes inside words and paths', () => {
    expect(detectTrigger('a/b', 3)).toBeUndefined();
    expect(detectTrigger('/usr/bin', 8)).toBeUndefined();
    expect(detectTrigger('hola', 4)).toBeUndefined();
  });
});

describe('replaceRange', () => {
  it('replaces and returns the new cursor', () => {
    expect(replaceRange('hi /lo x', 3, 6, '/locate ')).toEqual({
      text: 'hi /locate  x',
      cursor: 11,
    });
  });
});

describe('rankCommands', () => {
  it('orders prefix, substring, then description', () => {
    const list = [
      cmd('a', 'does review'),
      cmd('preview'),
      cmd('review'),
      cmd('zzz'),
    ];
    expect(rankCommands(list, 'review').map((c) => c.name)).toEqual([
      'review',
      'preview',
      'a',
    ]);
  });

  it('returns everything for an empty query', () => {
    expect(rankCommands([cmd('a'), cmd('b')], '')).toHaveLength(2);
  });
});
