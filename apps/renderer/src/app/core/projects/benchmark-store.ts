import { Injectable, inject, signal } from '@angular/core';
import type { AscuaError, BenchmarkReport } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { toAscuaError } from '../i18n/app-error';

/** Retrieval benchmark of a project index; progress comes from main's push events. */
@Injectable({ providedIn: 'root' })
export class BenchmarkStore {
  private readonly api = inject(ASCUA_API);
  private current: string | undefined;

  readonly report = signal<BenchmarkReport | undefined>(undefined);
  readonly running = signal(false);
  readonly progress = signal({ done: 0, total: 0 });
  readonly error = signal<AscuaError | undefined>(undefined);

  constructor() {
    this.api?.onBenchmarkProgress((p) => {
      if (p.projectId !== this.current) return;
      this.progress.set({ done: p.done, total: p.total });
    });
  }

  async run(projectId: string): Promise<void> {
    if (!this.api || this.running()) return;
    this.current = projectId;
    this.running.set(true);
    this.report.set(undefined);
    this.error.set(undefined);
    this.progress.set({ done: 0, total: 0 });
    try {
      const result = await this.api.runBenchmark(projectId);
      if ('code' in result) this.error.set(result);
      else this.report.set(result);
    } catch (e) {
      this.error.set(toAscuaError(e));
    } finally {
      this.running.set(false);
      this.current = undefined;
    }
  }
}
