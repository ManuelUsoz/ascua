import { describe, expect, it } from 'vitest';
import {
  decoderPrompt,
  MAX_PROMPT_TOKENS,
  stripPrompt,
  type PromptTokenizer,
} from './whisper-prompt';

const SPECIAL: Record<string, number> = {
  '<|startofprev|>': 1,
  '<|startoftranscript|>': 2,
  '<|es|>': 3,
  '<|en|>': 4,
  '<|transcribe|>': 5,
  '<|notimestamps|>': 6,
};

// Same shape as the transformers.js tokenizer: ids live on `model`.
function fake(
  tokens: number[],
): PromptTokenizer & { texts: string[]; options: unknown[] } {
  const texts: string[] = [];
  const options: unknown[] = [];
  return {
    texts,
    options,
    encode: (text, opts) => {
      texts.push(text);
      options.push(opts);
      return tokens;
    },
    model: { convert_tokens_to_ids: (names) => names.map((n) => SPECIAL[n]) },
  };
}

describe('decoderPrompt', () => {
  it('orders prev, prompt, start, language, task, notimestamps', () => {
    const tokenizer = fake([100, 101]);
    const { ids, prefixLength } = decoderPrompt(tokenizer, 'es', 'Ascua');
    expect(ids).toEqual([1, 100, 101, 2, 3, 5, 6]);
    expect(prefixLength).toBe(7);
    expect(tokenizer.texts).toEqual([' Ascua']);
    expect(tokenizer.options).toEqual([{ add_special_tokens: false }]);
  });

  it('keeps the last 223 prompt tokens', () => {
    const many = Array.from({ length: 300 }, (_, i) => 1000 + i);
    const { ids } = decoderPrompt(fake(many), 'en', 'x');
    expect(ids).toHaveLength(MAX_PROMPT_TOKENS + 5);
    expect(ids[1]).toBe(1077);
    expect(ids.at(-2)).toBe(5);
  });
});

describe('stripPrompt', () => {
  it('drops the forced prefix', () => {
    expect(stripPrompt([1, 2, 3, 9, 8], 3)).toEqual([9, 8]);
  });
});
