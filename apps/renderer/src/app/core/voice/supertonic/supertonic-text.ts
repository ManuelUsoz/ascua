/*
 * Ported from supertone-oss-archive/supertonic @ 1e9799e9, web/helper.js
 * (UnicodeProcessor). MIT License, Copyright (c) 2025 Supertone Inc.
 * See THIRD_PARTY_NOTICES.md.
 *
 * The model reads raw characters through unicode_indexer.json: no G2P.
 */
import type { Language } from '@ascua/ipc';

const EMOJI =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;

const REPLACEMENTS: [string, string][] = [
  ['–', '-'],
  ['‑', '-'],
  ['—', '-'],
  ['_', ' '],
  ['“', '"'],
  ['”', '"'],
  ['‘', "'"],
  ['’', "'"],
  ['´', "'"],
  ['`', "'"],
  ['[', ' '],
  [']', ' '],
  ['|', ' '],
  ['/', ' '],
  ['#', ' '],
  ['→', ' '],
  ['←', ' '],
];

/** Upstream applies these to every language; they are English words, so only `en` here. */
const ENGLISH_EXPRESSIONS: [string, string][] = [
  ['@', ' at '],
  ['e.g.,', 'for example, '],
  ['i.e.,', 'that is, '],
];

export function preprocessText(text: string, language: Language): string {
  let t = text.normalize('NFKD');
  t = t.replace(EMOJI, '');
  for (const [k, v] of REPLACEMENTS) t = t.split(k).join(v);
  t = t.replace(/[♥☆♡©\\]/g, '');
  if (language === 'en') {
    for (const [k, v] of ENGLISH_EXPRESSIONS) t = t.split(k).join(v);
  }

  t = t.replace(/ ,/g, ',');
  t = t.replace(/ \./g, '.');
  t = t.replace(/ !/g, '!');
  t = t.replace(/ \?/g, '?');
  t = t.replace(/ ;/g, ';');
  t = t.replace(/ :/g, ':');
  t = t.replace(/ '/g, "'");

  while (t.includes('""')) t = t.replace('""', '"');
  while (t.includes("''")) t = t.replace("''", "'");
  while (t.includes('``')) t = t.replace('``', '`');

  t = t.replace(/\s+/g, ' ').trim();
  if (!/[.!?;:,'"')\]}…。」』】〉》›»]$/.test(t)) t += '.';
  return `<${language}>${t}</${language}>`;
}

/** Code point -> `indexer[cp]`, `-1` when out of range. */
export function toTextIds(text: string, indexer: ArrayLike<number>): number[] {
  const ids: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    ids.push(cp < indexer.length ? (indexer[cp] ?? -1) : -1);
  }
  return ids;
}

/** One row of 1s up to `length`, 0s up to `maxLen`. */
export function lengthToMask(length: number, maxLen = length): Float32Array {
  const row = new Float32Array(maxLen);
  row.fill(1, 0, Math.min(length, maxLen));
  return row;
}
