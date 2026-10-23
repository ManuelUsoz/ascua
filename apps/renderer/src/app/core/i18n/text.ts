/** A translatable message: TS models return this, templates render it. */
export interface Text {
  key: string;
  params?: Record<string, string | number>;
}

export function text(key: string, params?: Text['params']): Text {
  return params ? { key, params } : { key };
}

/** `<base>.one` for 1, `<base>.other` otherwise (no messageformat plugin). */
export function pluralKey(base: string, n: number): string {
  return `${base}.${n === 1 ? 'one' : 'other'}`; // i18n-ignore: catalog key
}
