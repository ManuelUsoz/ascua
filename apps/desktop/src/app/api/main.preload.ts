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
  type IndexProgress,
  type Layout,
  type PermissionDecision,
  type PickTerminalFolderResult,
  type Project,
  type RepositoryLink,
  type SaveProjectResult,
  type Settings,
  type TerminalOutput,
  type TerminalReplay,
  type TerminalSession,
  type DeviceCodePrompt,
  type SourceControlStatus,
  type StartChatResult,
} from '@ascua/ipc';
import type {
  ChatEvent,
  ChatSession,
  ChatTranscript,
  ProviderAuth,
  ProviderInfo,
} from '@ascua/chat';
import type {
  Branch,
  Commit,
  Page,
  PullRequest,
  CommitDiff,
  PullRequestDiff,
  Repository,
} from '@ascua/source-control';

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
  getWindowState: () =>
    ipcRenderer.invoke(IPC.getWindowState) as Promise<FullscreenState>,
  quit: () => ipcRenderer.invoke(IPC.quit) as Promise<void>,
  dragStart: () => ipcRenderer.invoke(IPC.dragStart) as Promise<void>,
  dragEnd: () => ipcRenderer.invoke(IPC.dragEnd) as Promise<void>,
  openLink: (url) =>
    ipcRenderer.invoke(IPC.openLink, url) as Promise<AscuaError | undefined>,
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
  pickProjectFolder: (defaultPath) =>
    ipcRenderer.invoke(IPC.pickProjectFolder, defaultPath) as Promise<
      string | undefined
    >,
  getRepositoryLink: (ref) =>
    ipcRenderer.invoke(IPC.repositoryLink, ref) as Promise<RepositoryLink>,
  linkProjectRepository: (projectId, ref) =>
    ipcRenderer.invoke(
      IPC.linkProjectRepository,
      projectId,
      ref,
    ) as Promise<SaveProjectResult>,
  cloneProject: (input) =>
    ipcRenderer.invoke(IPC.cloneProject, input) as Promise<SaveProjectResult>,
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
  getSourceControlStatus: (provider) =>
    ipcRenderer.invoke(
      IPC.sourceControlStatus,
      provider,
    ) as Promise<SourceControlStatus>,
  connectSourceControl: (provider) =>
    ipcRenderer.invoke(
      IPC.sourceControlConnect,
      provider,
    ) as Promise<DeviceCodePrompt>,
  cancelSourceControlConnect: (provider) =>
    ipcRenderer.invoke(IPC.sourceControlCancel, provider) as Promise<void>,
  openSourceControlVerification: (provider) =>
    ipcRenderer.invoke(IPC.sourceControlOpenVerification, provider) as Promise<
      AscuaError | undefined
    >,
  disconnectSourceControl: (provider) =>
    ipcRenderer.invoke(IPC.sourceControlDisconnect, provider) as Promise<void>,
  onSourceControlChanged: (callback) =>
    listen<SourceControlStatus>(IPC.sourceControlChanged, callback),
  listRepositories: (provider, query) =>
    ipcRenderer.invoke(
      IPC.sourceControlRepositories,
      provider,
      query,
    ) as Promise<Page<Repository>>,
  listPullRequests: (provider, repoId, query) =>
    ipcRenderer.invoke(
      IPC.sourceControlPullRequests,
      provider,
      repoId,
      query,
    ) as Promise<Page<PullRequest>>,
  listBranches: (provider, repoId, query) =>
    ipcRenderer.invoke(
      IPC.sourceControlBranches,
      provider,
      repoId,
      query,
    ) as Promise<Page<Branch>>,
  listCommits: (provider, repoId, query) =>
    ipcRenderer.invoke(
      IPC.sourceControlCommits,
      provider,
      repoId,
      query,
    ) as Promise<Page<Commit>>,
  getPullRequestDiff: (provider, repoId, number, query) =>
    ipcRenderer.invoke(
      IPC.sourceControlDiff,
      provider,
      repoId,
      number,
      query,
    ) as Promise<PullRequestDiff>,
  getCommitDiff: (provider, repoId, sha, query) =>
    ipcRenderer.invoke(
      IPC.sourceControlCommitDiff,
      provider,
      repoId,
      sha,
      query,
    ) as Promise<CommitDiff>,
  submitPullRequestReview: (provider, repoId, number, review) =>
    ipcRenderer.invoke(
      IPC.sourceControlReview,
      provider,
      repoId,
      number,
      review,
    ) as Promise<void>,
  openSourceControlUrl: (provider, url) =>
    ipcRenderer.invoke(IPC.sourceControlOpenUrl, provider, url) as Promise<
      AscuaError | undefined
    >,
  listChatProviders: () =>
    ipcRenderer.invoke(IPC.chatProviders) as Promise<ProviderInfo[]>,
  getChatProviderAuth: (id) =>
    ipcRenderer.invoke(IPC.chatProviderAuth, id) as Promise<ProviderAuth>,
  loginChatProvider: (projectId, id) =>
    ipcRenderer.invoke(IPC.chatProviderLogin, projectId, id) as Promise<
      TerminalSession | AscuaError
    >,
  selectChatProvider: (id) =>
    ipcRenderer.invoke(IPC.chatSelectProvider, id) as Promise<Settings>,
  listChatSessions: (projectId) =>
    ipcRenderer.invoke(IPC.listChatSessions, projectId) as Promise<
      ChatSession[]
    >,
  startChat: (projectId, prompt, options) =>
    ipcRenderer.invoke(
      IPC.startChat,
      projectId,
      prompt,
      options,
    ) as Promise<StartChatResult>,
  listChatCommands: (projectId, sessionId) =>
    ipcRenderer.invoke(IPC.chatCommands, projectId, sessionId),
  listChatModels: (projectId) => ipcRenderer.invoke(IPC.chatModels, projectId),
  clearChat: (projectId, sessionId) =>
    ipcRenderer.invoke(IPC.clearChat, projectId, sessionId),
  deleteChat: (projectId, sessionId) =>
    ipcRenderer.invoke(IPC.deleteChat, projectId, sessionId),
  updateChatSession: (projectId, sessionId, patch) =>
    ipcRenderer.invoke(IPC.updateChatSession, projectId, sessionId, patch),
  getChatTranscript: (projectId, sessionId) =>
    ipcRenderer.invoke(IPC.chatTranscript, projectId, sessionId) as Promise<
      ChatTranscript | undefined
    >,
  sendChatPrompt: (projectId, sessionId, text) =>
    ipcRenderer.invoke(
      IPC.sendChatPrompt,
      projectId,
      sessionId,
      text,
    ) as Promise<AscuaError | undefined>,
  abortChat: (projectId, sessionId) =>
    ipcRenderer.invoke(IPC.abortChat, projectId, sessionId) as Promise<void>,
  resolveChatPermission: (projectId, sessionId, requestId, allow) =>
    ipcRenderer.invoke(
      IPC.resolveChatPermission,
      projectId,
      sessionId,
      requestId,
      allow,
    ) as Promise<AscuaError | undefined>,
  onChatEvent: (callback) => listen<ChatEvent>(IPC.chatEvent, callback),
  indexProject: (projectId) =>
    ipcRenderer.invoke(IPC.indexProject, projectId) as Promise<
      AscuaError | undefined
    >,
  onIndexProgress: (callback) =>
    listen<IndexProgress>(IPC.indexProgress, callback),
};

contextBridge.exposeInMainWorld('ascua', api);
