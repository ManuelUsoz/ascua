import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../storage/atomic-json';

const PROJECT_ID = /^[A-Za-z0-9_-]+$/;

/**
 * One JSON file per project (`<dir>/<projectId>.json`) holding
 * `{version: 1, [key]: T[]}`. Serialized queue per file, load cache, atomic
 * writes, and a corrupt file is moved aside.
 */
export class ProjectJsonFiles<T> {
  private readonly cache = new Map<string, T[]>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly dir: string,
    private readonly key: string,
    private readonly normalize: (items: T[]) => T[] = (items) => items,
  ) {}

  read(projectId: string): Promise<T[]> {
    return this.enqueue(projectId, async () =>
      structuredClone(await this.load(projectId)),
    );
  }

  /** `change` receives a private copy and returns the next list. */
  update<R = void>(
    projectId: string,
    change: (items: T[]) => { items: T[]; result?: R },
  ): Promise<R | undefined> {
    return this.enqueue(projectId, async () => {
      const current = await this.load(projectId);
      const { items, result } = change(structuredClone(current));
      const next = structuredClone(items);
      await mkdir(this.dir, { recursive: true });
      await writeJsonAtomic(this.path(projectId), {
        version: 1,
        [this.key]: next,
      });
      this.cache.set(projectId, next);
      return result;
    });
  }

  remove(projectId: string): Promise<void> {
    return this.enqueue(projectId, async () => {
      await rm(this.path(projectId), { force: true });
      this.cache.delete(projectId);
    });
  }

  private path(projectId: string): string {
    if (!PROJECT_ID.test(projectId)) {
      throw new Error('projectId inválido'); // i18n-ignore: log only
    }
    return join(this.dir, `${projectId}.json`);
  }

  private enqueue<R>(projectId: string, task: () => Promise<R>): Promise<R> {
    let file: string;
    try {
      file = this.path(projectId);
    } catch (error) {
      return Promise.reject(error);
    }
    const queue = this.queues.get(file) ?? Promise.resolve();
    const run = queue.then(task, task);
    this.queues.set(
      file,
      run.catch(() => undefined),
    );
    return run;
  }

  private async load(projectId: string): Promise<T[]> {
    const cached = this.cache.get(projectId);
    if (cached) return cached;
    const items = await this.readFile(projectId);
    this.cache.set(projectId, items);
    return items;
  }

  private async readFile(projectId: string): Promise<T[]> {
    const file = this.path(projectId);
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    try {
      const data = JSON.parse(raw) as Record<string, unknown> | null;
      const items = data?.[this.key];
      if (data?.['version'] !== 1 || !Array.isArray(items)) {
        throw new Error('Formato no reconocido'); // i18n-ignore: log only
      }
      return this.normalize(items as T[]);
    } catch (error) {
      const aside = `${file}.corrupt-${Date.now()}`;
      console.error(`[ascua] ${file} corrupto, movido a ${aside}`, error);
      try {
        await rename(file, aside);
      } catch (renameError) {
        console.error('[ascua] no se pudo apartar el archivo', renameError);
      }
      return [];
    }
  }
}
