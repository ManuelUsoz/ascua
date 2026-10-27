import { Injectable, inject } from '@angular/core';
import type { AscuaError } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { toAscuaError } from '../i18n/app-error';

export type MethodologyResult =
  | { ok: true; rules: string }
  | { ok: false; error: AscuaError };

/** Per-project methodology rules: pass-through to main, nothing cached. */
@Injectable({ providedIn: 'root' })
export class MethodologyStore {
  private readonly api = inject(ASCUA_API);

  load(projectId: string): Promise<MethodologyResult> {
    return this.run((api) => api.getMethodology(projectId));
  }

  save(projectId: string, rules: string): Promise<MethodologyResult> {
    return this.run((api) => api.saveMethodology(projectId, rules));
  }

  reset(projectId: string): Promise<MethodologyResult> {
    return this.run((api) => api.resetMethodology(projectId));
  }

  private async run(
    call: (api: NonNullable<typeof this.api>) => Promise<unknown>,
  ): Promise<MethodologyResult> {
    if (!this.api) return { ok: false, error: { code: 'unknown' } };
    try {
      const r = (await call(this.api)) as AscuaError | { rules: string };
      if ('code' in r) return { ok: false, error: r };
      return { ok: true, rules: r.rules };
    } catch (e) {
      return { ok: false, error: toAscuaError(e) };
    }
  }
}
