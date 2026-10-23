import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  screen,
  shell,
  type Rectangle,
} from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  IPC,
  type BloomOrigin,
  type Layout,
  type PermissionDecision,
  type PermissionRequest,
} from '@ascua/ipc';
import {
  githubOAuthClientId,
  rendererAppName,
  rendererAppPort,
} from './constants';
import { GitHubDeviceAuth, createGitHubProvider } from '@ascua/source-control/github';
import { CredentialStore } from './source-control/credential-store';
import { SourceControlService } from './source-control/source-control-service';
import { HookServer } from './hook-server';

/** Compact companion window, in DIP. Must match the renderer's avatar host. */
export const COMPACT = { width: 420, height: 320 };
/** Side of the avatar square, in DIP. Must match the renderer's CSS. */
export const AVATAR = 120;
const MARGIN = 16;
const POLL_MS = 40;
const SAVE_DELAY_MS = 600;
const DRAG_INTERVAL_MS = 16;

interface SavedPosition {
  x: number;
  y: number;
}

/**
 * Owns the one and only BrowserWindow: compact companion by default, true
 * fullscreen when the avatar is double-clicked. The renderer only ever sees
 * this through the `window.ascua` preload API.
 */
export class WindowController {
  private win: BrowserWindow | null = null;
  private compactBounds: Rectangle | null = null;
  private readonly hooks = new HookServer();
  private bubble = false;
  private rendererReady = false;
  private layout: Layout = { left: false, top: false };
  private expanded = false;
  private fullscreenAnnounced = false;
  private pendingOrigin: BloomOrigin | undefined;
  private dragging = false;
  private interactive = false;
  private pollTimer: NodeJS.Timeout | undefined;
  private dragTimer: NodeJS.Timeout | undefined;
  private saveTimer: NodeJS.Timeout | undefined;
  private closingWindow = false;

  create(): BrowserWindow {
    const position = this.restorePosition();
    this.closingWindow = false;

    this.win = new BrowserWindow({
      ...COMPACT,
      x: position.x,
      y: position.y,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      resizable: false,
      focusable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: true,
      title: 'Ascua',
      webPreferences: {
        preload: join(__dirname, 'main.preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false,
        // The companion is always visible; throttling it would freeze the life loop.
        backgroundThrottling: false,
      },
    });

    this.win.setMenu(null);
    this.win.setAlwaysOnTop(true, 'floating');
    try {
      this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {
      // Not supported on every platform.
    }
    this.win.setIgnoreMouseEvents(true, { forward: true });

    this.win.once('ready-to-show', () => {
      this.win?.showInactive();
      this.win?.moveTop();
    });

    this.win.webContents.on('did-finish-load', () => {
      this.win?.showInactive();
      this.win?.moveTop();
      this.rendererReady = true;
      for (const request of this.hooks.pendingRequests) {
        this.send(IPC.permissionRequest, request);
      }
    });
    this.win.webContents.on('did-start-loading', () => {
      this.rendererReady = false;
    });
    this.win.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error('[ascua] renderer failed', code, description, url);
    });
    this.win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[ascua] renderer gone', details);
    });

    this.win.on('enter-full-screen', () => {
      this.expanded = true;
      this.applyInteraction();
      this.announceFullscreen(this.pendingOrigin ?? this.bloomOrigin());
    });

    // Closing a fullscreen window on Windows first leaves fullscreen; never
    // resurrect the window there, the close must finish.
    this.win.on('leave-full-screen', () => {
      if (this.closingWindow || !this.expanded) return;
      this.expanded = false;
      this.pendingOrigin = undefined;
      this.fullscreenAnnounced = false;
      this.restoreCompactBounds();
      this.applyInteraction();
      this.send(IPC.fullscreenChanged, { fullscreen: false });
    });

    // Closing a fullscreen window on Windows first leaves fullscreen; never
    // resurrect the window there, the close must finish.
    this.win.on('close', () => {
      this.closingWindow = true;
    });

    // Windows leaves fullscreen while minimizing; land the renderer on the
    // compact frame while still hidden, then restore as the resting avatar.
    this.win.on('minimize', () => {
      if (this.closingWindow) return;
      if (this.expanded) {
        this.collapseFromMinimize();
        return;
      }
      // Compact windows are unminimizable; if the OS minimized one anyway
      // (e.g. right after a collapse), bring the avatar back.
      setTimeout(() => this.showIfMinimized(), 120);
    });

    this.win.on('moved', () => this.scheduleSave());
    this.win.on('closed', () => {
      this.stopPolling();
      this.stopDrag();
      this.win = null;
    });

    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.win.webContents.on('will-navigate', (event, url) => {
      const current = this.win?.webContents.getURL();
      if (current && url !== current) event.preventDefault();
    });
    this.win.webContents.on('will-attach-webview', (event) => event.preventDefault());

    this.load();
    this.startPolling();
    this.emitLayout();
    return this.win;
  }

  /** IPC handlers. Call once, after `create()`. */
  register(): void {
    ipcMain.handle(IPC.toggleFullscreen, () => this.toggleFullscreen());
    ipcMain.handle(IPC.exitFullscreen, () => this.exitFullscreen());
    ipcMain.handle(IPC.isFullscreen, () => this.win?.isFullScreen() ?? false);
    ipcMain.handle(IPC.quit, () => app.quit());
    ipcMain.handle(IPC.getLayout, () => this.layout);
    ipcMain.handle(IPC.dragStart, () => this.startDrag());
    ipcMain.handle(IPC.dragEnd, () => this.endDrag());
    ipcMain.handle(
      IPC.resolvePermission,
      (_event, id: number, decision: PermissionDecision) =>
        this.hooks.resolve(id, decision),
    );

    this.hooks.start({
      onRequest: (request) => this.showPermission(request),
      onResolved: (id) => this.permissionResolved(id),
    });
    app.on('will-quit', () => this.hooks.stop());

    const fetchViaNet: typeof fetch = (input, init) =>
      net.fetch(input as string, init as RequestInit);
    const sourceControl = new SourceControlService({
      store: new CredentialStore(),
      auths: githubOAuthClientId
        ? {
            github: new GitHubDeviceAuth({
              clientId: githubOAuthClientId,
              fetch: fetchViaNet,
            }),
          }
        : {},
      factories: { github: createGitHubProvider },
      fetch: fetchViaNet,
      notify: (status) => this.send(IPC.sourceControlStatusChanged, status),
      openExternal: (url) => shell.openExternal(url),
    });
    sourceControl.register();
    void sourceControl.restore();
  }

  private showPermission(request: PermissionRequest): void {
    this.bubble = true;
    this.applyInteraction();
    // If the renderer is still loading, `did-finish-load` re-sends the hook's
    // pending requests.
    if (this.rendererReady) this.send(IPC.permissionRequest, request);
  }

  private permissionResolved(id: number): void {
    // Covers both a decision and a hook that disconnected early; the renderer
    // removes the card by id either way.
    this.send(IPC.permissionDismissed, id);
    if (this.hooks.pendingCount > 0) return;
    this.bubble = false;
    this.applyInteraction();
  }

  private load(): void {
    if (!this.win) return;
    if (!app.isPackaged) {
      this.win.loadURL(`http://localhost:${rendererAppPort}`);
    } else {
      this.win.loadFile(join(__dirname, '..', rendererAppName, 'index.html'));
    }
  }

  private toggleFullscreen(): BloomOrigin {
    const origin = this.bloomOrigin();
    if (!this.win || this.win.isDestroyed() || this.expanded) return origin;

    this.compactBounds = this.win.getBounds();
    this.pendingOrigin = origin;
    this.fullscreenAnnounced = false;
    this.expanded = true;
    this.win.setFocusable(true);
    this.win.setMinimizable(true);
    this.win.setAlwaysOnTop(false);
    this.win.setResizable(false);
    this.win.setFullScreen(true);
    this.win.focus();
    this.announceFullscreen(origin);

    return origin;
  }

  private exitFullscreen(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.expanded = false;
    this.fullscreenAnnounced = false;
    this.pendingOrigin = undefined;
    this.win.setFullScreen(false);
    this.restoreCompactBounds();
    this.applyInteraction();
    setTimeout(() => {
      if (this.win && !this.win.isDestroyed()) {
        this.send(IPC.fullscreenChanged, { fullscreen: false });
      }
    }, 60);
  }

  /**
   * Windows may report the enter-full-screen event before the window has been
   * resized to the display. Announce only once the bounds cover the display so
   * the renderer's bloom starts in a fullscreen viewport.
   */
  private announceFullscreen(origin: BloomOrigin): void {
    if (this.fullscreenAnnounced) return;
    const started = Date.now();
    const check = () => {
      if (!this.win || this.win.isDestroyed() || !this.expanded) return;
      const bounds = this.win.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const full =
        bounds.x === display.bounds.x &&
        bounds.y === display.bounds.y &&
        bounds.width >= display.bounds.width - 2 &&
        bounds.height >= display.bounds.height - 2;
      if (full || Date.now() - started > 1200) {
        if (this.fullscreenAnnounced) return;
        this.fullscreenAnnounced = true;
        this.send(IPC.fullscreenChanged, { fullscreen: true, origin });
      } else {
        setTimeout(check, 16);
      }
    };
    setTimeout(check, 0);
  }

  private restoreCompactBounds(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const bounds = this.compactBounds ?? this.restorePosition();
    this.win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: COMPACT.width,
      height: COMPACT.height,
    });
    this.win.setFocusable(false);
    this.win.setMinimizable(false);
    this.win.setAlwaysOnTop(true, 'floating');
  }

  /** The avatar's position on its display, for the renderer's bloom origin. */
  private bloomOrigin(): BloomOrigin {
    const win = this.win;
    if (!win) {
      return { x: 0, y: 0, size: AVATAR, width: 0, height: 0 };
    }
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const avatarX = bounds.x + (this.layout.left ? 0 : bounds.width - AVATAR);
    const avatarY = bounds.y + (this.layout.top ? 0 : bounds.height - AVATAR);
    return {
      x: avatarX - display.bounds.x,
      y: avatarY - display.bounds.y,
      size: AVATAR,
      width: display.bounds.width,
      height: display.bounds.height,
    };
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (!this.win || this.win.isDestroyed()) return;
      if (this.expanded || this.dragging || this.bubble) {
        this.setInteractive(true);
        return;
      }
      const cursor = screen.getCursorScreenPoint();
      const bounds = this.win.getBounds();
      const avatarX = bounds.x + (this.layout.left ? 0 : bounds.width - AVATAR);
      const avatarY = bounds.y + (this.layout.top ? 0 : bounds.height - AVATAR);
      const inside =
        cursor.x >= avatarX &&
        cursor.x < avatarX + AVATAR &&
        cursor.y >= avatarY &&
        cursor.y < avatarY + AVATAR;
      this.setInteractive(inside);
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private setInteractive(interactive: boolean): void {
    if (interactive === this.interactive) return;
    this.interactive = interactive;
    this.win?.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  private applyInteraction(): void {
    this.setInteractive(this.expanded || this.dragging || this.bubble);
  }

  /**
   * Minimizing a fullscreen room on Windows leaves fullscreen behind the
   * scenes. Land the renderer on the compact frame while the window is still
   * hidden, give it a beat to paint it, then restore the window as the
   * resting avatar: no flux, no taskbar-icon flip.
   */
  private collapseFromMinimize(): void {
    this.expanded = false;
    this.pendingOrigin = undefined;
    this.fullscreenAnnounced = false;
    this.send(IPC.fullscreenChanged, { fullscreen: false });
    // A minimized window doesn't repaint; this beat lets the compact frame
    // land before the window comes back on screen.
    setTimeout(() => {
      const win = this.win;
      if (!win || win.isDestroyed()) return;
      win.restore();
      win.setFullScreen(false);
      this.restoreCompactBounds();
      win.showInactive();
      win.moveTop();
      this.forceInteraction();
    }, 40);
  }

  private showIfMinimized(): void {
    const win = this.win;
    if (!win || win.isDestroyed() || !win.isMinimized()) return;
    win.restore();
    win.showInactive();
    win.moveTop();
    this.forceInteraction();
  }

  /**
   * `setIgnoreMouseEvents` can go stale across a minimize/restore on Windows;
   * always re-issue the current state.
   */
  private forceInteraction(): void {
    this.interactive = !this.interactive;
    this.applyInteraction();
  }

  private startDrag(): void {
    if (!this.win || this.dragging) return;
    this.dragging = true;
    this.setInteractive(true);

    const startCursor = screen.getCursorScreenPoint();
    const startBounds = this.win.getBounds();

    this.dragTimer = setInterval(() => {
      if (!this.win || this.win.isDestroyed()) return;
      const cursor = screen.getCursorScreenPoint();
      this.win.setBounds({
        x: startBounds.x + cursor.x - startCursor.x,
        y: startBounds.y + cursor.y - startCursor.y,
        width: COMPACT.width,
        height: COMPACT.height,
      });
    }, DRAG_INTERVAL_MS);
  }

  private endDrag(): void {
    this.stopDrag();
    if (!this.win || this.win.isDestroyed()) return;
    this.clampToWorkArea();
    this.scheduleSave();
  }

  private stopDrag(): void {
    if (this.dragTimer) clearInterval(this.dragTimer);
    this.dragTimer = undefined;
    this.dragging = false;
  }

  private clampToWorkArea(): void {
    if (!this.win) return;
    const bounds = this.win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const area = display.workArea;
    const x = Math.min(
      Math.max(bounds.x, area.x),
      area.x + area.width - COMPACT.width,
    );
    const y = Math.min(
      Math.max(bounds.y, area.y),
      area.y + area.height - COMPACT.height,
    );
    if (x !== bounds.x || y !== bounds.y) {
      this.win.setBounds({
        x,
        y,
        width: COMPACT.width,
        height: COMPACT.height,
      });
    }
  }

  private emitLayout(): void {
    this.send(IPC.layoutChanged, this.layout);
  }

  private send(channel: string, payload: unknown): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(channel, payload);
  }

  private positionFile(): string {
    return join(app.getPath('userData'), 'position.json');
  }

  private restorePosition(): SavedPosition {
    try {
      const file = this.positionFile();
      if (existsSync(file)) {
        const saved = JSON.parse(readFileSync(file, 'utf8')) as SavedPosition;
        if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          const candidate = {
            x: saved.x,
            y: saved.y,
            width: COMPACT.width,
            height: COMPACT.height,
          };
          const visible = screen
            .getAllDisplays()
            .some((display) => intersects(display.workArea, candidate));
          if (visible) return { x: saved.x, y: saved.y };
        }
      }
    } catch {
      // Fall through to the default spot.
    }

    const area = screen.getPrimaryDisplay().workArea;
    return {
      x: area.x + area.width - COMPACT.width - MARGIN,
      y: area.y + area.height - COMPACT.height - MARGIN,
    };
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (!this.win || this.win.isDestroyed() || this.expanded) return;
      const { x, y } = this.win.getBounds();
      try {
        const file = this.positionFile();
        mkdirSync(join(app.getPath('userData')), { recursive: true });
        writeFileSync(file, JSON.stringify({ x, y }));
      } catch {
        // Position persistence is best-effort.
      }
    }, SAVE_DELAY_MS);
  }
}

function intersects(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
