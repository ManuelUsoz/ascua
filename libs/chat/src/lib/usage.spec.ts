import { describe, expect, it } from 'vitest';
import { EMPTY_USAGE, addUsage, type Usage } from './usage';

const u = (over: Partial<Usage> = {}): Usage => ({
  inputTokens: 1,
  outputTokens: 2,
  cacheReadTokens: 3,
  cacheWriteTokens: 4,
  ...over,
});

describe('addUsage', () => {
  it('sums tokens and cost when both know it', () => {
    const r = addUsage(u({ costUsd: 0.5 }), u({ costUsd: 0.25, model: 'm' }));
    expect(r).toEqual({
      inputTokens: 2,
      outputTokens: 4,
      cacheReadTokens: 6,
      cacheWriteTokens: 8,
      costUsd: 0.75,
      model: 'm',
    });
  });

  it('leaves cost undefined when one side is unknown', () => {
    expect(addUsage(u({ costUsd: 1 }), u()).costUsd).toBeUndefined();
    expect(addUsage(EMPTY_USAGE, u()).costUsd).toBeUndefined();
  });
});
