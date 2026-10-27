import { Injectable, inject, signal } from '@angular/core';
import type { AscuaError, IndexProgress } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { toAscuaError } from '../i18n/app-error';

/** Indexing progress per project, fed by main's push events. */
@Injectable({ providedIn: 'root' })
export class IndexStore {
  private readonly api = inject(ASCUA_API);
  private readonly byProject = signal<ReadonlyMap<string, IndexProgress>>(
    new Map(),
  );

  constructor() {
    this.api?.onIndexProgress((p) => {
      if (p.state === 'error') console.error('[index] progress error', p);
      else console.log('[index] progress push', p);
      this.set(p);
    });
  }

  progress(projectId: string): IndexProgress | undefined {
    return this.byProject().get(projectId);
  }

  /** Starts (or joins) the index run of a project; failures become an error state. */
  async start(projectId: string): Promise<void> {
    if (!this.api) return;
    const state = this.progress(projectId)?.state;
    console.log('[index] start requested', { projectId, state });
    if (state === 'running' || state === 'done') return;
    this.set({ projectId, done: 0, total: 0, state: 'running' });
    let error: AscuaError | undefined;
    try {
      error = await this.api.indexProject(projectId);
      console.log('[index] indexProject resolved', {
        projectId,
        error,
        current: this.progress(projectId),
      });
    } catch (e) {
      console.error('[index] indexProject threw', e);
      error = toAscuaError(e);
    }
    if (error) {
      console.error('[index] indexProject returned error', error);
      this.set({ projectId, done: 0, total: 0, state: 'error', error });
    }
  }

  private set(p: IndexProgress): void {
    console.log('[index] set', p);
    this.byProject.update((m) => new Map(m).set(p.projectId, p));
  }
}
