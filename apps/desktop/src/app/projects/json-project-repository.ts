import { readFile, rename } from 'node:fs/promises';
import type { Project, ProjectInput } from '@ascua/ipc';
import { writeJsonAtomic } from '../storage/atomic-json';
import { normalizeProject, ProjectInputError } from './project-input';
import type { ProjectRepository } from './project-repository';

interface ProjectsFile {
  version: 1;
  projects: Project[];
}

export class JsonProjectRepository implements ProjectRepository {
  private projects: Project[] | undefined;
  private loading: Promise<Project[]> | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  async list(): Promise<Project[]> {
    return structuredClone(await this.load());
  }

  async get(id: string): Promise<Project | undefined> {
    const project = (await this.load()).find((item) => item.id === id);
    return project ? structuredClone(project) : undefined;
  }

  save(project: Project): Promise<Project> {
    return this.enqueue(async () => {
      const projects = await this.load();
      const copy = structuredClone(project);
      const next = [...projects];
      const index = next.findIndex((item) => item.id === copy.id);
      if (index >= 0) next[index] = copy;
      else next.push(copy);
      await this.persist(next);
      this.projects = next;
      return structuredClone(copy);
    });
  }

  update(
    id: string,
    change: (project: Project) => Project,
  ): Promise<Project | undefined> {
    return this.enqueue(async () => {
      const projects = await this.load();
      const index = projects.findIndex((item) => item.id === id);
      if (index < 0) return undefined;
      const updated = structuredClone(change(structuredClone(projects[index])));
      const next = [...projects];
      next[index] = updated;
      await this.persist(next);
      this.projects = next;
      return structuredClone(updated);
    });
  }

  remove(id: string): Promise<void> {
    return this.enqueue(async () => {
      const projects = await this.load();
      if (!projects.some((item) => item.id === id)) return;
      const next = projects.filter((item) => item.id !== id);
      await this.persist(next);
      this.projects = next;
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private load(): Promise<Project[]> {
    if (this.projects) return Promise.resolve(this.projects);
    this.loading ??= this.read().then(
      (projects) => {
        this.projects = projects;
        return projects;
      },
      (error) => {
        this.loading = undefined;
        throw error;
      },
    );
    return this.loading;
  }

  private async read(): Promise<Project[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    try {
      const data = JSON.parse(raw) as Partial<ProjectsFile>;
      if (data.version !== 1 || !Array.isArray(data.projects)) {
        throw new Error('Formato de projects.json no reconocido'); // i18n-ignore: log only
      }
      const valid: Project[] = [];
      for (const entry of data.projects) {
        try {
          valid.push(
            normalizeProject(entry as ProjectInput, () => {
              throw new ProjectInputError('project.idMissing');
            }),
          );
        } catch (invalid) {
          console.warn(
            '[ascua] proyecto inválido ignorado en projects.json',
            invalid,
          );
        }
      }
      return valid;
    } catch (error) {
      const aside = `${this.file}.corrupt-${Date.now()}`;
      console.error(`[ascua] projects.json corrupto, movido a ${aside}`, error);
      try {
        await rename(this.file, aside);
      } catch (renameError) {
        console.error('[ascua] no se pudo apartar projects.json', renameError);
      }
      return [];
    }
  }

  private async persist(projects: Project[]): Promise<void> {
    const data: ProjectsFile = { version: 1, projects };
    await writeJsonAtomic(this.file, data);
  }
}
