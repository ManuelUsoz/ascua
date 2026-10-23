import { computed, Injectable, inject, signal } from '@angular/core';
import type {
  PickTerminalFolderResult,
  Project,
  ProjectInput,
  SaveProjectResult,
  TerminalSpecInput,
} from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';

/** The save payload of a stored project, optionally with other terminals. */
export function projectInput(
  project: Project,
  terminals: TerminalSpecInput[] = project.terminals,
): ProjectInput {
  const input: ProjectInput = {
    id: project.id,
    name: project.name,
    path: project.path,
    terminals,
  };
  if (project.color) input.color = project.color;
  return input;
}

/** The projects stored by main. Empty in the browser preview. */
@Injectable({ providedIn: 'root' })
export class ProjectStore {
  private readonly api = inject(ASCUA_API);
  private readonly list = signal<Project[]>([]);
  private readonly ready = signal(false);

  readonly projects = this.list.asReadonly();
  readonly loaded = this.ready.asReadonly();
  private readonly index = computed(
    () => new Map(this.list().map((project) => [project.id, project])),
  );

  constructor() {
    void this.reload();
  }

  byId(id: string | undefined): Project | undefined {
    return id === undefined ? undefined : this.index().get(id);
  }

  async reload(): Promise<void> {
    const api = this.api;
    if (!api) {
      this.ready.set(true);
      return;
    }
    try {
      this.list.set(await api.listProjects());
    } catch {
      // Keep whatever we had; the list stays usable.
    }
    this.ready.set(true);
  }

  async save(input: ProjectInput): Promise<SaveProjectResult> {
    const api = this.api;
    if (!api) return { ok: false, error: 'Sin conexión con Ascua' };
    const result = await api.saveProject(input);
    if (result.ok) {
      const saved = result.project;
      this.list.update((projects) =>
        projects.some((project) => project.id === saved.id)
          ? projects.map((project) => (project.id === saved.id ? saved : project))
          : [...projects, saved],
      );
    }
    return result;
  }

  /** Add a pista to a project, or replace the one with the same id. */
  async savePista(
    projectId: string,
    spec: TerminalSpecInput,
  ): Promise<SaveProjectResult> {
    const project = this.byId(projectId);
    if (!project) return { ok: false, error: 'No existe el proyecto.' };
    const terminals: TerminalSpecInput[] =
      spec.id && project.terminals.some((t) => t.id === spec.id)
        ? project.terminals.map((t) => (t.id === spec.id ? spec : t))
        : [...project.terminals, spec];
    return this.save(projectInput(project, terminals));
  }

  async removePista(
    projectId: string,
    terminalId: string,
  ): Promise<SaveProjectResult> {
    const project = this.byId(projectId);
    if (!project) return { ok: false, error: 'No existe el proyecto.' };
    return this.save(
      projectInput(
        project,
        project.terminals.filter((t) => t.id !== terminalId),
      ),
    );
  }

  async pickPistaFolder(
    projectId: string,
  ): Promise<PickTerminalFolderResult | undefined> {
    return this.api?.pickTerminalFolder(projectId);
  }

  async remove(id: string): Promise<void> {
    const api = this.api;
    if (!api) return;
    await api.deleteProject(id);
    this.list.update((projects) =>
      projects.filter((project) => project.id !== id),
    );
  }

  async pickFolder(): Promise<string | undefined> {
    return this.api?.pickProjectFolder();
  }
}
