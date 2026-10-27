import { readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Methodology } from '@ascua/chat';
import { writeJsonAtomic } from '../../storage/atomic-json';

const PROJECT_ID = /^[A-Za-z0-9_-]+$/;

export const DEFAULT_METHODOLOGY: Methodology = {
  id: 'ascua-default',
  title: 'Ascua methodology', // i18n-ignore: model instructions
  // i18n-ignore: model instructions
  rules: [
    '1. Locate first: find the relevant code with the index search before editing anything.',
    '2. Keep changes small and in scope; do not fix unrelated things.',
    '3. Verify: run the project tests, typecheck or build after editing and report the result.',
  ].join('\n'),
  tools: [
    // i18n-ignore: model instructions
    {
      tool: 'index search',
      when: 'to find symbols and usages before reading files',
    },
    // i18n-ignore: model instructions
    { tool: 'Read', when: 'to read a file or range before editing it' },
    // i18n-ignore: model instructions
    {
      tool: 'Bash',
      when: 'to run tests, typecheck or build to verify a change',
    },
  ],
};

/** Per-project methodology in `<dir>/<projectId>.json`. Never touches the project. */
export class MethodologyStore {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly dir: string) {}

  load(projectId: string): Promise<Methodology> {
    return this.enqueue(projectId, async (file) => {
      let raw: string;
      try {
        raw = await readFile(file, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return structuredClone(DEFAULT_METHODOLOGY);
        }
        throw error;
      }
      try {
        const data = JSON.parse(raw) as {
          version?: number;
          methodology?: Methodology;
        } | null;
        const m = data?.methodology;
        if (
          data?.version !== 1 ||
          !m ||
          typeof m.rules !== 'string' ||
          typeof m.title !== 'string' ||
          !Array.isArray(m.tools)
        ) {
          throw new Error('Formato no reconocido'); // i18n-ignore: log only
        }
        return m;
      } catch (error) {
        const aside = `${file}.corrupt-${Date.now()}`;
        console.error(`[ascua] ${file} corrupto, movido a ${aside}`, error);
        try {
          await rename(file, aside);
        } catch (renameError) {
          console.error('[ascua] no se pudo apartar el archivo', renameError);
        }
        return structuredClone(DEFAULT_METHODOLOGY);
      }
    });
  }

  async save(projectId: string, methodology: Methodology): Promise<void> {
    await this.enqueue(projectId, (file) =>
      writeJsonAtomic(file, {
        version: 1,
        methodology: structuredClone(methodology),
      }),
    );
  }

  async reset(projectId: string): Promise<void> {
    await this.enqueue(projectId, (file) => rm(file, { force: true }));
  }

  private enqueue<R>(
    projectId: string,
    task: (file: string) => Promise<R>,
  ): Promise<R> {
    if (!PROJECT_ID.test(projectId)) {
      return Promise.reject(new Error('projectId inválido')); // i18n-ignore: log only
    }
    const file = join(this.dir, `${projectId}.json`);
    const queue = this.queues.get(file) ?? Promise.resolve();
    const run = queue.then(
      () => task(file),
      () => task(file),
    );
    this.queues.set(
      file,
      run.catch(() => undefined),
    );
    return run;
  }
}
