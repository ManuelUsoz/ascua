import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Project, ProjectInput } from '@ascua/ipc';
import { normalizeProject, ProjectInputError } from './project-input';
import type { ProjectRepository } from './project-repository';

interface ProjectsFile {
  version: 1;
  projects: Project[];
}

const RENAME_RETRIES = 5;
const RENAME_DELAY_MS = 40;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

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
        throw new Error('Formato de projects.json no reconocido');
      }
      const valid: Project[] = [];
      for (const entry of data.projects) {
        try {
          valid.push(
            normalizeProject(entry as ProjectInput, () => {
              throw new ProjectInputError('Falta un id');
            }),
          );
        } catch (invalid) {
          console.warn('[ascua] proyecto inválido ignorado en projects.json', invalid);
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
    const tmp = `${this.file}.tmp`;
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, this.file);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const retry =
          process.platform === 'win32' &&
          (code === 'EPERM' || code === 'EBUSY') &&
          attempt < RENAME_RETRIES;
        if (!retry) throw error;
        await sleep(RENAME_DELAY_MS);
      }
    }
  }
}
