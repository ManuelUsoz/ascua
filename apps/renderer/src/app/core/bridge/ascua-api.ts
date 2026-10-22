import { InjectionToken } from '@angular/core';
import type { AscuaApi } from '@ascua/ipc';

/**
 * The preload bridge (`window.ascua`). Undefined in a plain browser preview
 * (`nx serve renderer`), where every caller must degrade gracefully.
 */
export const ASCUA_API = new InjectionToken<AscuaApi | undefined>('ASCUA_API', {
  providedIn: 'root',
  factory: () => window.ascua,
});
