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
}
