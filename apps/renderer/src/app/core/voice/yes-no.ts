import type { Language } from '@ascua/ipc';

const MAX_WORDS = 4;

const ANSWERS: Record<
  Language,
  { allow: readonly string[]; deny: readonly string[] }
> = {
  es: {
    allow: ['si', 'dale', 'ok', 'claro', 'hacelo', 'de una'],
    deny: ['no', 'cancela', 'mejor no'],
  },
  en: {
    allow: ['yes', 'yeah', 'sure', 'do it', 'ok'],
    deny: ['no', 'nope', 'cancel'],
  },
};

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reads a short spoken sí/no; anything longer or unclear is undefined. */
export function answerFor(
  text: string,
  lang: Language,
): 'allow' | 'deny' | undefined {
  const folded = fold(text);
  if (!folded || folded.split(' ').length > MAX_WORDS) return undefined;
  const { allow, deny } = ANSWERS[lang];
  const padded = ` ${folded} `;
  const has = (phrases: readonly string[]) =>
    phrases.some((p) => padded.includes(` ${p} `));
  // "no" wins: "no, dale" or "mejor no" must never approve.
  if (has(deny)) return 'deny';
  if (has(allow)) return 'allow';
  return undefined;
}
