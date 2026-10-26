import type { Project, UiLabels } from '@ascua/ipc';

const MAX_CHARS = 600;
const LABEL_KEYS = [
  'nav.projects',
  'nav.terminals',
  'nav.files',
  'nav.settings',
  'nav.repositories',
  'nav.assistant',
  'terminals.pista.name',
] as const;

/**
 * Words Whisper should get right: the app, the user's projects and pistas, the
 * UI labels in their language and a few fixed terms. Capped so the decoder
 * prompt stays short.
 */
export function voiceVocabulary(
  projects: readonly Project[],
  labels: UiLabels,
): string {
  const words = new Set<string>(['Ascua']);
  for (const project of projects) {
    words.add(project.name);
    for (const terminal of project.terminals) words.add(terminal.name);
  }
  for (const key of LABEL_KEYS) {
    const label = labels[key];
    if (label) words.add(label);
  }
  words.add('GitHub'); // i18n-ignore
  words.add('PR'); // i18n-ignore

  let out = '';
  for (const word of words) {
    const trimmed = word.trim();
    if (!trimmed) continue;
    const next = out ? `${out}, ${trimmed}` : trimmed;
    if (next.length > MAX_CHARS) break;
    out = next;
  }
  return out;
}
