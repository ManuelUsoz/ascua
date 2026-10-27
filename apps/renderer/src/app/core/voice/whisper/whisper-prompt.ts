import type { Language } from '@ascua/ipc';

/** The slice of the transformers.js tokenizer this module needs. */
export interface PromptTokenizer {
  encode(text: string, options?: { add_special_tokens?: boolean }): number[];
  model: { convert_tokens_to_ids(tokens: string[]): number[] };
}

/**
 * Whisper keeps room for 448 target positions; the previous-text prompt may use
 * at most half of them minus one (the model was trained with 223).
 */
export const MAX_PROMPT_TOKENS = 223;

export interface DecoderPrompt {
  ids: number[];
  /** Tokens before the first generated one that `stripPrompt` removes. */
  prefixLength: number;
}

/**
 * `<|startofprev|> prompt <|startoftranscript|> <|lang|> <|transcribe|>
 * <|notimestamps|>`. Token ids differ between Whisper builds, so they are
 * looked up in the tokenizer. transformers.js 3.8 keeps `prompt_ids` only as
 * a config field, hence `decoder_input_ids`.
 */
export function decoderPrompt(
  tokenizer: PromptTokenizer,
  language: Language,
  prompt: string,
): DecoderPrompt {
  const [prev, start, lang, task, noTimestamps] =
    tokenizer.model.convert_tokens_to_ids([
      '<|startofprev|>',
      '<|startoftranscript|>',
      `<|${language}|>`,
      '<|transcribe|>',
      '<|notimestamps|>',
    ]);
  // No special tokens: the encoder would add Whisper's own inside the prompt.
  const text = tokenizer
    .encode(` ${prompt.trim()}`, { add_special_tokens: false })
    .slice(-MAX_PROMPT_TOKENS);
  const ids = [prev, ...text, start, lang, task, noTimestamps];
  return { ids, prefixLength: ids.length };
}

/** Drops the forced prefix from a `generate` output row. */
export function stripPrompt(ids: number[], prefixLength: number): number[] {
  return ids.slice(prefixLength);
}
