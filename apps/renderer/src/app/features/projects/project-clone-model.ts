import { FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import type { CloneProjectInput, RepositoryRef } from '@ascua/ipc';

export type ProjectCloneForm = FormGroup<{
  name: FormControl<string>;
  color: FormControl<string | null>;
  parentDir: FormControl<string>;
  folderName: FormControl<string>;
}>;

export interface ProjectCloneValue {
  name: string;
  color: string | null;
  parentDir: string;
  folderName: string;
}

export function createCloneForm(fb: NonNullableFormBuilder): ProjectCloneForm {
  return fb.group({
    name: fb.control(''),
    color: new FormControl<string | null>(null),
    parentDir: fb.control(''),
    folderName: fb.control(''),
  });
}

/** Parent of a path, for either separator. Empty when there is none. */
export function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (i < 0) return '';
  return i === 0 ? trimmed.slice(0, 1) : trimmed.slice(0, i);
}

export function toCloneInput(
  value: ProjectCloneValue,
  ref: RepositoryRef,
): CloneProjectInput {
  const input: CloneProjectInput = {
    repository: ref,
    name: value.name.trim(),
    parentDir: value.parentDir.trim(),
    folderName: value.folderName.trim(),
  };
  if (value.color) input.color = value.color;
  return input;
}

/** Preview only: main decides the real path. */
export function targetPath(parentDir: string, folderName: string): string {
  if (!parentDir) return folderName;
  const sep = parentDir.includes('\\') && !parentDir.includes('/') ? '\\' : '/';
  return parentDir.replace(/[\\/]+$/, '') + sep + folderName;
}
