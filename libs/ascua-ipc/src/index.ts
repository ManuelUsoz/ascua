// Contract shared by the Electron main process, the preload bridge and the
// Angular renderer. Keep this file dependency-free: it is imported from all
// three worlds.

export const IPC = {
  toggleFullscreen: 'ascua:window:toggle-fullscreen',
  exitFullscreen: 'ascua:window:exit-fullscreen',
  isFullscreen: 'ascua:window:is-fullscreen',
  fullscreenChanged: 'ascua:window:fullscreen-changed',
  quit: 'ascua:app:quit',
  dragStart: 'ascua:window:drag-start',
  dragEnd: 'ascua:window:drag-end',
  getLayout: 'ascua:window:get-layout',
  layoutChanged: 'ascua:window:layout-changed',
  permissionRequest: 'ascua:permission:request',
  permissionDismissed: 'ascua:permission:dismissed',
  resolvePermission: 'ascua:permission:resolve',
  listProjects: 'ascua:projects:list',
  saveProject: 'ascua:projects:save',
  deleteProject: 'ascua:projects:delete',
  pickProjectFolder: 'ascua:projects:pick-folder',
  pickTerminalFolder: 'ascua:projects:pick-terminal-folder',
  listTerminals: 'ascua:terminals:list',
  startTerminal: 'ascua:terminals:start',
  stopTerminal: 'ascua:terminals:stop',
  writeTerminal: 'ascua:terminals:write',
  resizeTerminal: 'ascua:terminals:resize',
  replayTerminal: 'ascua:terminals:replay',
  terminalOutput: 'ascua:terminals:output',
  terminalChanged: 'ascua:terminals:changed',
  openShell: 'ascua:terminals:open-shell',
  closeShell: 'ascua:terminals:close-shell',
  terminalRemoved: 'ascua:terminals:removed',
  listDir: 'ascua:files:list-dir',
  fileIndex: 'ascua:files:index',
  readFile: 'ascua:files:read',
  openFile: 'ascua:files:open',
  writeFile: 'ascua:files:write',
  revealFile: 'ascua:files:reveal',
} as const;

/** Which corner of the compact window the avatar hugs. */
export interface Layout {
  left: boolean;
  top: boolean;
}

/**
 * Where the avatar is on the display when the window goes fullscreen.
 * All values are DIP (Electron's screen coordinate space).
 */
export interface BloomOrigin {
  /** Avatar left, relative to the display's top-left. */
  x: number;
  /** Avatar top, relative to the display's top-left. */
  y: number;
  /** Avatar side, in DIP. */
  size: number;
  /** Display bounds. */
  width: number;
  height: number;
}

export interface FullscreenState {
  fullscreen: boolean;
  /** Present when entering fullscreen; the bloom's starting rect. */
  origin?: BloomOrigin;
}

/** A Claude Code permission request forwarded from the hook socket. */
export interface PermissionRequest {
  id: number;
  tool: string;
  summary: string;
  input: unknown;
}

/**
 * `allow` and `deny` answer Claude Code through the hook. `terminal` leaves the
 * decision to Claude Code's own terminal prompt.
 */
export type PermissionDecision = 'allow' | 'deny' | 'terminal';

/** A command a project can run in its own terminal. */
export interface TerminalSpec {
  id: string;
  name: string;
  command: string;
  /** Folder relative to the project path. Defaults to the project path. */
  cwd?: string;
  port?: number;
}

export interface Project {
  id: string;
  name: string;
  /** Absolute path of the project folder. */
  path: string;
  /** `#rrggbb` */
  color?: string;
  terminals: TerminalSpec[];
}

/** A terminal spec as submitted by the form: new ones have no id yet. */
export type TerminalSpecInput = Omit<TerminalSpec, 'id'> & { id?: string };

/** A project as submitted by the form: a new project has no id yet. */
export type ProjectInput = Omit<Project, 'id' | 'terminals'> & {
  id?: string;
  terminals: TerminalSpecInput[];
};

export type SaveProjectResult =
  | { ok: true; project: Project }
  | { ok: false; error: string };

export type TerminalStatus = 'running' | 'stopped' | 'failed';

/** `pista` is backed by a saved spec; `shell` is an ad-hoc, closable shell. */
export type TerminalKind = 'pista' | 'shell';

export interface TerminalSession {
  /** `terminalKey(projectId, terminalId)` */
  id: string;
  projectId: string;
  terminalId: string;
  kind: TerminalKind;
  /** Ad-hoc shells only: "shell", "shell 2"... */
  name?: string;
  status: TerminalStatus;
  exitCode?: number;
  error?: string;
}

export interface TerminalSize {
  cols: number;
  rows: number;
}

/** A chunk of terminal output. `seq` is the total chars emitted so far. */
export interface TerminalOutput {
  id: string;
  data: string;
  seq: number;
}

/** Buffered output of a terminal; `seq` matches `TerminalOutput.seq`. */
export interface TerminalReplay {
  data: string;
  seq: number;
}

/** `cwd` is relative to the project, '/'-separated; empty = project root. */
export type PickTerminalFolderResult =
  | { ok: true; cwd: string }
  | { ok: false; error: string };

export interface FileEntry {
  name: string;
  /** Relative to the project root, '/'-separated. */
  path: string;
  dir: boolean;
}

export interface FileIndex {
  /** Relative paths, '/'-separated. */
  files: string[];
  truncated: boolean;
}

export type FileContent =
  | {
      kind: 'text';
      text: string;
      size: number;
      /** Opaque content hash, sent back on save to detect disk changes. */
      version: string;
      /** Safe to hand to the default app (not launchable code). */
      openable: boolean;
      /** False when the bytes are not valid UTF-8: shown lossy, never saved. */
      editable: boolean;
    }
  | { kind: 'binary' | 'too-large'; size: number };

export type SaveFileResult =
  | { ok: true; version: string; size: number }
  | { ok: false; conflict: true };

export function terminalKey(projectId: string, terminalId: string): string {
  return `${projectId}:${terminalId}`;
}

/** The API exposed by the preload script as `window.ascua`. */
export interface AscuaApi {
  toggleFullscreen(): Promise<BloomOrigin>;
  exitFullscreen(): Promise<void>;
  isFullscreen(): Promise<boolean>;
  /** The user pressed the room's close button: quit Ascua entirely. */
  quit(): Promise<void>;
  dragStart(): Promise<void>;
  dragEnd(): Promise<void>;
  getLayout(): Promise<Layout>;
  onFullscreenChanged(callback: (state: FullscreenState) => void): () => void;
  onLayoutChanged(callback: (layout: Layout) => void): () => void;
  onPermissionRequest(
    callback: (request: PermissionRequest) => void,
  ): () => void;
  /** The hook disconnected before the user answered. */
  onPermissionDismissed(callback: (id: number) => void): () => void;
  resolvePermission(
    id: number,
    decision: PermissionDecision,
  ): Promise<void>;
  listProjects(): Promise<Project[]>;
  saveProject(input: ProjectInput): Promise<SaveProjectResult>;
  deleteProject(id: string): Promise<void>;
  /** Native folder picker; `undefined` when cancelled. */
  pickProjectFolder(): Promise<string | undefined>;
  /** Folder picker starting at the project root; `undefined` when cancelled. */
  pickTerminalFolder(
    projectId: string,
  ): Promise<PickTerminalFolderResult | undefined>;
  listTerminals(): Promise<TerminalSession[]>;
  startTerminal(
    projectId: string,
    terminalId: string,
    size?: TerminalSize,
  ): Promise<TerminalSession>;
  stopTerminal(projectId: string, terminalId: string): Promise<void>;
  /** Open an ad-hoc shell at the project root. */
  openShell(projectId: string, size?: TerminalSize): Promise<TerminalSession>;
  /** Kill and forget an ad-hoc shell. */
  closeShell(projectId: string, terminalId: string): Promise<void>;
  replayTerminal(id: string): Promise<TerminalReplay>;
  /** Fire-and-forget keystrokes. */
  writeTerminal(id: string, data: string): void;
  /** Fire-and-forget resize. */
  resizeTerminal(id: string, size: TerminalSize): void;
  onTerminalOutput(callback: (output: TerminalOutput) => void): () => void;
  onTerminalChanged(callback: (session: TerminalSession) => void): () => void;
  /** A session was forgotten; the argument is its `TerminalSession.id`. */
  onTerminalRemoved(callback: (id: string) => void): () => void;
  /** Children of a project folder (`''` = root). Rejects outside the project. */
  listDir(projectId: string, dir: string): Promise<FileEntry[]>;
  fileIndex(projectId: string): Promise<FileIndex>;
  readFile(projectId: string, path: string): Promise<FileContent>;
  /**
   * Open in the default app; resolves to an error message, or undefined.
   * Refuses files that are not openable (binary, launchable, executable).
   */
  openFile(projectId: string, path: string): Promise<string | undefined>;
  /** Save text in place. Without `version` it overwrites; with it, a file
   * changed on disk yields a conflict instead of a write. */
  writeFile(
    projectId: string,
    path: string,
    text: string,
    version?: string,
  ): Promise<SaveFileResult>;
  /** Show in the file manager; resolves to an error message, or undefined. */
  revealFile(projectId: string, path: string): Promise<string | undefined>;
}
