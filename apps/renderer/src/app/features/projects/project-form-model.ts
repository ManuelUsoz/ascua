import { FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import type { Project, ProjectInput } from '@ascua/ipc';
import { projectInput } from '../../core/projects/project-store';

export type ProjectForm = FormGroup<{
  name: FormControl<string>;
  path: FormControl<string>;
  color: FormControl<string | null>;
}>;

export interface ProjectFormValue {
  name: string;
  path: string;
  color: string | null;
}

export function createProjectForm(fb: NonNullableFormBuilder): ProjectForm {
  return fb.group({
    name: fb.control(''),
    path: fb.control(''),
    color: new FormControl<string | null>(null),
  });
}

export function fromProject(project: Project): ProjectFormValue {
  return {
    name: project.name,
    path: project.path,
    color: project.color ?? null,
  };
}

/** Pistas are not edited here: an existing project keeps its stored ones. */
export function toProjectInput(
  value: ProjectFormValue,
  existing?: Project,
): ProjectInput {
  const input: ProjectInput = existing
    ? projectInput(existing)
    : { name: '', path: '', terminals: [] };
  input.name = value.name.trim();
  input.path = value.path.trim();
  if (value.color) input.color = value.color;
  else delete input.color;
  return input;
}
