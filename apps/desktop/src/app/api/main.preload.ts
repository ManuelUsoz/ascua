import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AscuaApi,
  type BloomOrigin,
  type FullscreenState,
  type Layout,
  type PermissionDecision,
  type PermissionRequest,
} from '@ascua/ipc';

const api: AscuaApi = {
  toggleFullscreen: () =>
    ipcRenderer.invoke(IPC.toggleFullscreen) as Promise<BloomOrigin>,
  exitFullscreen: () => ipcRenderer.invoke(IPC.exitFullscreen) as Promise<void>,
  isFullscreen: () =>
    ipcRenderer.invoke(IPC.isFullscreen) as Promise<boolean>,
  quit: () => ipcRenderer.invoke(IPC.quit) as Promise<void>,
  dragStart: () => ipcRenderer.invoke(IPC.dragStart) as Promise<void>,
  dragEnd: () => ipcRenderer.invoke(IPC.dragEnd) as Promise<void>,
  getLayout: () => ipcRenderer.invoke(IPC.getLayout) as Promise<Layout>,
  onFullscreenChanged: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: FullscreenState,
    ) => callback(value);
    ipcRenderer.on(IPC.fullscreenChanged, listener);
    return () => ipcRenderer.removeListener(IPC.fullscreenChanged, listener);
  },
  onLayoutChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: Layout) =>
      callback(value);
    ipcRenderer.on(IPC.layoutChanged, listener);
    return () => ipcRenderer.removeListener(IPC.layoutChanged, listener);
  },
  onPermissionRequest: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: PermissionRequest,
    ) => callback(value);
    ipcRenderer.on(IPC.permissionRequest, listener);
    return () => ipcRenderer.removeListener(IPC.permissionRequest, listener);
  },
  onPermissionDismissed: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, id: number) =>
      callback(id);
    ipcRenderer.on(IPC.permissionDismissed, listener);
    return () => ipcRenderer.removeListener(IPC.permissionDismissed, listener);
  },
  resolvePermission: (id, decision: PermissionDecision) =>
    ipcRenderer.invoke(IPC.resolvePermission, id, decision) as Promise<void>,
};

contextBridge.exposeInMainWorld('ascua', api);
