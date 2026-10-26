export type NoteNameError = 'note.nameRequired' | 'note.nameInvalid';

export const NOTE_NAME_MAX = 120;

// `#`, `[`, `]` and `|` are wiki-link syntax ([[Nota#Encabezado|alias]]) and cannot be linked.
const FORBIDDEN = /[/\\:*?"<>|#[\]]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Why `name` cannot be a note file name, or undefined when it can. */
export function noteNameError(name: string): NoteNameError | undefined {
  if (name.trim() === '') return 'note.nameRequired';
  if (
    name !== name.trim() ||
    name.length > NOTE_NAME_MAX ||
    FORBIDDEN.test(name) ||
    CONTROL.test(name) ||
    name.startsWith('.') ||
    name.endsWith('.') ||
    RESERVED.test(name)
  ) {
    return 'note.nameInvalid';
  }
  return undefined;
}
