import { FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import type { TerminalSpec, TerminalSpecInput } from '@ascua/ipc';
import { text, type Text } from '../../core/i18n/text';

export type PistaForm = FormGroup<{
  name: FormControl<string>;
  command: FormControl<string>;
  cwd: FormControl<string>;
  port: FormControl<number | null>;
}>;

/** Plain values of the pista form; `cwd` is relative to the project, '' = root. */
export interface PistaFormValue {
  name: string;
  command: string;
  cwd: string;
  port: number | null;
}

export function createPistaForm(
  fb: NonNullableFormBuilder,
  spec?: TerminalSpec,
): PistaForm {
  return fb.group({
    name: fb.control(spec?.name ?? ''),
    command: fb.control(spec?.command ?? ''),
    cwd: fb.control(spec?.cwd ?? ''),
    port: new FormControl<number | null>(spec?.port ?? null),
  });
}

export function toTerminalInput(
  value: PistaFormValue,
  id?: string,
): TerminalSpecInput {
  const spec: TerminalSpecInput = {
    name: value.name.trim(),
    command: value.command.trim(),
  };
  if (id) spec.id = id;
  const cwd = value.cwd.trim();
  if (cwd) spec.cwd = cwd;
  // type=number inputs yield a number (or null when empty), never a string.
  if (value.port !== null && value.port !== undefined)
    spec.port = Number(value.port);
  return spec;
}

export function folderLabel(cwd: string): Text {
  return cwd
    ? text('terminals.pista.folderPath', { path: `${cwd}/` })
    : text('terminals.pista.root');
}
