import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AscuaApi,
  type AscuaError,
  type BloomOrigin,
  type FileContent,
  type SaveFileResult,
  type FileEntry,
  type FileIndex,
  type FullscreenState,
  type Layout,
  type PermissionDecision,
  type PickTerminalFolderResult,
  type Project,
  type SaveProjectResult,
  type Settings,
  type TerminalOutput,
  type TerminalReplay,
  type TerminalSession,
} from '@ascua/ipc';

function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) =>
    callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: AscuaApi = {
  toggleFullscreen: () =>
    ipcRenderer.invoke(IPC.toggleFullscreen) as Promise<BloomOrigin>,
  exitFullscreen: () => ipcRenderer.invoke(IPC.exitFullscreen) as Promise<void>,
  isFullscreen: () => ipcRenderer.invoke(IPC.isFullscreen) as Promise<boolean>,
  quit: () => ipcRenderer.invoke(IPC.quit) as Promise<void>,
  dragStart: () => ipcRenderer.invoke(IPC.dragStart) as Promise<void>,
  dragEnd: () => ipcRenderer.invoke(IPC.dragEnd) as Promise<void>,
  getLayout: () => ipcRenderer.invoke(IPC.getLayout) as Promise<Layout>,
  getSettings: () => ipcRenderer.invoke(IPC.getSettings) as Promise<Settings>,
  updateSettings: (patch) =>
    ipcRenderer.invoke(IPC.updateSettings, patch) as Promise<Settings>,
  onSettingsChanged: (callback) =>
    listen<Settings>(IPC.settingsChanged, callback),
  onFullscreenChanged: (callback) =>
    listen<FullscreenState>(IPC.fullscreenChanged, callback),
  onLayoutChanged: (callback) => listen<Layout>(IPC.layoutChanged, callback),
  onPermissionRequest: (callback) => listen(IPC.permissionRequest, callback),
  onPermissionDismissed: (callback) =>
    listen<number>(IPC.permissionDismissed, callback),
  resolvePermission: (id, decision: PermissionDecision) =>
    ipcRenderer.invoke(IPC.resolvePermission, id, decision) as Promise<void>,
  listProjects: () =>
    ipcRenderer.invoke(IPC.listProjects) as Promise<Project[]>,
  saveProject: (input) =>
    ipcRenderer.invoke(IPC.saveProject, input) as Promise<SaveProjectResult>,
  savePista: (projectId, spec) =>
    ipcRenderer.invoke(
      IPC.savePista,
      projectId,
      spec,
    ) as Promise<SaveProjectResult>,
  removePista: (projectId, terminalId) =>
    ipcRenderer.invoke(
      IPC.removePista,
      projectId,
      terminalId,
    ) as Promise<SaveProjectResult>,
  deleteProject: (id) =>
    ipcRenderer.invoke(IPC.deleteProject, id) as Promise<void>,
  pickProjectFolder: () =>
    ipcRenderer.invoke(IPC.pickProjectFolder) as Promise<string | undefined>,
  pickTerminalFolder: (projectId) =>
    ipcRenderer.invoke(IPC.pickTerminalFolder, projectId) as Promise<
      PickTerminalFolderResult | undefined
    >,
  listTerminals: () =>
    ipcRenderer.invoke(IPC.listTerminals) as Promise<TerminalSession[]>,
  startTerminal: (projectId, terminalId, size) =>
    ipcRenderer.invoke(
      IPC.startTerminal,
      projectId,
      terminalId,
      size,
    ) as Promise<TerminalSession>,
  stopTerminal: (projectId, terminalId) =>
    ipcRenderer.invoke(
      IPC.stopTerminal,
      projectId,
      terminalId,
    ) as Promise<void>,
  openShell: (projectId, size) =>
    ipcRenderer.invoke(
      IPC.openShell,
      projectId,
      size,
    ) as Promise<TerminalSession>,
  closeShell: (projectId, terminalId) =>
    ipcRenderer.invoke(IPC.closeShell, projectId, terminalId) as Promise<void>,
  replayTerminal: (id) =>
    ipcRenderer.invoke(IPC.replayTerminal, id) as Promise<TerminalReplay>,
  writeTerminal: (id, data) => ipcRenderer.send(IPC.writeTerminal, id, data),
  resizeTerminal: (id, size) => ipcRenderer.send(IPC.resizeTerminal, id, size),
  onTerminalOutput: (callback) =>
    listen<TerminalOutput>(IPC.terminalOutput, callback),
  onTerminalChanged: (callback) =>
    listen<TerminalSession>(IPC.terminalChanged, callback),
  onTerminalRemoved: (callback) =>
    listen<string>(IPC.terminalRemoved, callback),
  listDir: (projectId, dir) =>
    ipcRenderer.invoke(IPC.listDir, projectId, dir) as Promise<FileEntry[]>,
  fileIndex: (projectId) =>
    ipcRenderer.invoke(IPC.fileIndex, projectId) as Promise<FileIndex>,
  readFile: (projectId, path) =>
    ipcRenderer.invoke(IPC.readFile, projectId, path) as Promise<FileContent>,
  openFile: (projectId, path) =>
    ipcRenderer.invoke(IPC.openFile, projectId, path) as Promise<
      AscuaError | undefined
    >,
  writeFile: (projectId, path, text, version) =>
    ipcRenderer.invoke(
      IPC.writeFile,
      projectId,
      path,
      text,
      version,
    ) as Promise<SaveFileResult>,
  revealFile: (projectId, path) =>
    ipcRenderer.invoke(IPC.revealFile, projectId, path) as Promise<
      AscuaError | undefined
    >,
};

contextBridge.exposeInMainWorld('ascua', api);
