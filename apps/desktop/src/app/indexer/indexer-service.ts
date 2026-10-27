import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AscuaError, IndexProgress } from '@ascua/ipc';
import type { ProjectRepository } from '../projects/project-repository';

export type ForkIndexer = (script: string, args: string[]) => UtilityProcess;

export interface IndexerServiceOptions {
  projects: Pick<ProjectRepository, 'get'>;
  push: (event: IndexProgress) => void;
  isPackaged: boolean;
  resourcesPath: string;
  /** `app.getPath('userData')`: index DBs live under `indexes/`, never in the project. */
  userDataPath: string;
  /** Directory holding `dist/apps/indexer` parent in dev. */
  devRoot?: string;
  fork?: ForkIndexer;
}

export function indexerEntry(
  isPackaged: boolean,
  resourcesPath: string,
  devRoot = process.cwd(),
): string {
  return isPackaged
    ? join(resourcesPath, 'indexer', 'main.mjs')
    : join(devRoot, 'dist', 'apps', 'indexer', 'main.mjs');
}

export function indexDbPath(userDataPath: string, projectId: string): string {
  return join(userDataPath, 'indexes', `${projectId}.db`);
}

const log = (message: string, ...rest: unknown[]) =>
  console.log(`[indexer] ${message}`, ...rest);

export class IndexerService {
  private readonly running = new Map<string, UtilityProcess>();
  private readonly fork: ForkIndexer;

  constructor(private readonly options: IndexerServiceOptions) {
    this.fork =
      options.fork ??
      ((script, args) =>
        utilityProcess.fork(script, args, {
          serviceName: 'Ascua indexer',
          stdio: 'pipe',
        }));
  }

  /** Never throws: failures arrive as an `error` progress event. */
  async index(projectId: string): Promise<AscuaError | undefined> {
    if (this.running.has(projectId)) return undefined;
    let root: string | undefined;
    try {
      root = (await this.options.projects.get(projectId))?.path;
    } catch {
      root = undefined;
    }
    log('index requested', { projectId, root });
    if (!root) {
      log('project not found or has no path', { projectId });
      const error: AscuaError = { code: 'indexer.notFound' };
      this.emit({ projectId, done: 0, total: 0, state: 'error', error });
      return error;
    }
    if (this.running.has(projectId)) return undefined;
    this.run(projectId, root);
    return undefined;
  }

  dispose(): void {
    for (const child of this.running.values()) child.kill();
    this.running.clear();
  }

  private run(projectId: string, root: string): void {
    const { isPackaged, resourcesPath, devRoot } = this.options;
    let done = 0;
    let total = 0;
    let finished = false;
    const fail = () => {
      if (finished) return;
      finished = true;
      this.running.delete(projectId);
      this.emit({
        projectId,
        done,
        total,
        state: 'error',
        error: { code: 'indexer.failed' },
      });
    };
    let child: UtilityProcess;
    try {
      const dir = join(this.options.userDataPath, 'indexes');
      mkdirSync(dir, { recursive: true });
      const entry = indexerEntry(isPackaged, resourcesPath, devRoot);
      const db = indexDbPath(this.options.userDataPath, projectId);
      log('forking', { entry, entryExists: existsSync(entry), root, db });
      child = this.fork(entry, ['index', root, '--db', db]);
    } catch (e) {
      console.error('[indexer] fork failed', e);
      fail();
      return;
    }
    this.running.set(projectId, child);
    this.emit({ projectId, done, total, state: 'running' });
    child.on('spawn', () => log('spawned', { projectId, pid: child.pid }));
    child.stderr?.on('data', (chunk: Buffer | string) =>
      console.error(`[indexer:stderr] ${chunk.toString().trimEnd()}`),
    );
    let buffer = '';
    const line = (text: string) => {
      try {
        const parsed = JSON.parse(text) as { done?: unknown; total?: unknown };
        if (typeof parsed.done !== 'number' || typeof parsed.total !== 'number')
          return;
        done = parsed.done;
        total = parsed.total;
        this.emit({ projectId, done, total, state: 'running' });
      } catch {
        log('non-progress stdout', text);
      }
    };
    child.stdout?.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const text of lines) if (text.trim()) line(text);
    });
    child.on('exit', (code) => {
      log('exited', { projectId, code, done, total, finished });
      if (finished) return;
      if (buffer.trim()) line(buffer);
      if (code !== 0) return fail();
      finished = true;
      this.running.delete(projectId);
      this.emit({ projectId, done: total, total, state: 'done' });
    });
  }

  private emit(event: IndexProgress): void {
    try {
      this.options.push(event);
    } catch {
      // window gone
    }
  }
}
