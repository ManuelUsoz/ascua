import { LANGUAGES, type Language } from '@ascua/ipc';

const baseOf = (tag: string): string =>
  tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';

/** The OS language when it is supported, Spanish otherwise. */
export function initialLanguage(preferred: string[], locale: string): Language {
  const base = baseOf(preferred[0] ?? locale);
  return LANGUAGES.find((language) => language === base) ?? 'es';
}
