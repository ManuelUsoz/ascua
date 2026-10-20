import type { AscuaApi } from '@ascua/ipc';

declare global {
  interface Window {
    /** Injected by the Electron preload; absent when running in a plain browser. */
    ascua?: AscuaApi;
  }
}

export {};
