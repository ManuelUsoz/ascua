import { app, ipcMain } from 'electron';
import { IPC } from '@ascua/ipc';
import type { AscuaWindow } from './ascua-window';

/** Window IPC handlers. Call once, after `window.create()`. */
export function registerWindowIpc(window: AscuaWindow): void {
  ipcMain.handle(IPC.toggleFullscreen, () => window.toggleFullscreen());
  ipcMain.handle(IPC.exitFullscreen, () => window.exitFullscreen());
  ipcMain.handle(IPC.isFullscreen, () => window.isFullscreen());
  ipcMain.handle(IPC.quit, () => app.quit());
  ipcMain.handle(IPC.getLayout, () => window.layout);
  ipcMain.handle(IPC.dragStart, () => window.startDrag());
  ipcMain.handle(IPC.dragEnd, () => window.endDrag());
}
