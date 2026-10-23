import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AscuaApi,
  type BloomOrigin,
  type FullscreenState,
  type Layout,
  type PermissionDecision,
  type PermissionRequest,
  type SourceControlBridge,
} from '@ascua/ipc';
import type {
  CiRun,
  Commit,
  PullRequest,
  Repository,
  SourceControlStatus,
} from '@ascua/source-control';

const sourceControl: SourceControlBridge = {
  status: () =>
    ipcRenderer.invoke(IPC.sourceControlStatus) as Promise<SourceControlStatus>,
  connect: (provider) =>
    ipcRenderer.invoke(
      IPC.sourceControlConnect,
      provider,
    ) as Promise<SourceControlStatus>,
  cancelConnect: () =>
    ipcRenderer.invoke(IPC.sourceControlCancel) as Promise<void>,
  openVerification: () =>
    ipcRenderer.invoke(IPC.sourceControlOpenVerification) as Promise<void>,
  disconnect: () =>
    ipcRenderer.invoke(IPC.sourceControlDisconnect) as Promise<void>,
  listRepositories: () =>
    ipcRenderer.invoke(IPC.sourceControlRepositories) as Promise<Repository[]>,
  listPullRequests: (repo) =>
    ipcRenderer.invoke(
      IPC.sourceControlPullRequests,
      repo,
    ) as Promise<PullRequest[]>,
  listCommits: (repo) =>
    ipcRenderer.invoke(IPC.sourceControlCommits, repo) as Promise<Commit[]>,
  listCiRuns: (repo) =>
    ipcRenderer.invoke(IPC.sourceControlCiRuns, repo) as Promise<CiRun[]>,
  openUrl: (url) =>
    ipcRenderer.invoke(IPC.sourceControlOpenUrl, url) as Promise<void>,
  onStatusChanged: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: SourceControlStatus,
    ) => callback(value);
    ipcRenderer.on(IPC.sourceControlStatusChanged, listener);
    return () =>
      ipcRenderer.removeListener(IPC.sourceControlStatusChanged, listener);
  },
};

const api: AscuaApi = {
  sourceControl,
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
