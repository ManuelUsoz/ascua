import { app, ipcMain, shell } from 'electron';
import { IPC, type AscuaError } from '@ascua/ipc';
import type { AscuaWindow } from './ascua-window';

const LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

/** Opens a link in the system browser; only web and mail links are allowed. */
export async function openLink(
  value: unknown,
  openExternal: (url: string) => Promise<void> | void = (url) =>
    shell.openExternal(url),
): Promise<AscuaError | undefined> {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    return { code: 'invalidLink' };
  }
  if (!LINK_PROTOCOLS.has(url.protocol)) return { code: 'invalidLink' };
  try {
    await openExternal(url.toString());
    return undefined;
  } catch {
    return { code: 'unknown' };
  }
}

/** Window IPC handlers. Call once, after `window.create()`. */
export function registerWindowIpc(window: AscuaWindow): void {
  ipcMain.handle(IPC.toggleFullscreen, () => window.toggleFullscreen());
  ipcMain.handle(IPC.exitFullscreen, () => window.exitFullscreen());
  ipcMain.handle(IPC.isFullscreen, () => window.isFullscreen());
  ipcMain.handle(IPC.getWindowState, () => window.state());
  ipcMain.handle(IPC.quit, () => app.quit());
  ipcMain.handle(IPC.getLayout, () => window.layout);
  ipcMain.handle(IPC.dragStart, () => window.startDrag());
  ipcMain.handle(IPC.dragEnd, () => window.endDrag());
<<<<<<< HEAD
  ipcMain.handle(IPC.voiceActive, (_e, active: unknown) =>
    window.setVoiceActive(active === true),
  );
=======
  ipcMain.handle(IPC.openLink, (_event, url: unknown) => openLink(url));
>>>>>>> origin/master
}
