import { app, BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import {
  IPC,
  type BloomOrigin,
  type FullscreenState,
  type Layout,
} from '@ascua/ipc';
import type { PermissionBridge } from '../permissions/permission-bridge';
import { ClickThrough } from './click-through';
import { WindowDrag } from './drag';
import { AVATAR, COMPACT } from './geometry';
import { FullscreenController } from './fullscreen';
import { fullscreenModeFor } from './fullscreen-mode';
import { PositionStore } from './position-store';
import { hardenWebContents, loadRenderer } from './renderer-page';

const ZERO_ORIGIN: BloomOrigin = {
  x: 0,
  y: 0,
  size: AVATAR,
  width: 0,
  height: 0,
};

/**
 * Owns the one and only BrowserWindow: compact companion by default, true
 * fullscreen when the avatar is double-clicked. The renderer only ever sees
 * this through the `window.ascua` preload API.
 */
export class AscuaWindow {
  readonly layout: Layout = { left: false, top: false };
  private win: BrowserWindow | null = null;
  private permissions: PermissionBridge | null = null;
  private rendererReady = false;
  private positions: PositionStore | null = null;
  private clickThrough: ClickThrough | null = null;
  private drag: WindowDrag | null = null;
  private fullscreen: FullscreenController | null = null;

  create(): BrowserWindow {
    const positions = new PositionStore(
      join(app.getPath('userData'), 'position.json'),
      screen,
    );
    this.positions = positions;
    const position = positions.restore();

    const win = new BrowserWindow({
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
      icon: join(__dirname, 'assets', 'icon.png'),
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
    this.win = win;

    const clickThrough = new ClickThrough({
      win,
      screen,
      layout: this.layout,
      forced: () =>
        (this.fullscreen?.expanded ?? false) ||
        (this.drag?.active ?? false) ||
        (this.permissions?.active ?? false),
    });
    this.clickThrough = clickThrough;
    this.drag = new WindowDrag({
      win,
      screen,
      onEnd: () => this.scheduleSave(),
    });
    const fullscreen = new FullscreenController({
      win,
      screen,
      layout: this.layout,
      mode: fullscreenModeFor(process.platform),
      send: (channel, payload) => this.send(channel, payload),
      applyInteraction: () => clickThrough.apply(),
      forceInteraction: () => clickThrough.force(),
      fallbackBounds: () => positions.restore(),
    });
    this.fullscreen = fullscreen;

    win.setMenu(null);
    win.setAlwaysOnTop(true, 'floating');
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {
      // Not supported on every platform.
    }
    win.setIgnoreMouseEvents(true, { forward: true });

    win.once('ready-to-show', () => {
      if (fullscreen.expanded) {
        win.show();
        win.focus();
      } else {
        win.showInactive();
      }
      win.moveTop();
    });

    win.webContents.on('did-finish-load', () => {
      win.showInactive();
      win.moveTop();
      this.rendererReady = true;
      this.permissions?.resendPending();
    });
    // A full renderer load (Ctrl+R, dev-server reload) boots the compact UI
    // while main still thinks the room is open, leaving a stuck fullscreen
    // window. Hash routing only fires did-navigate-in-page, so tab switches
    // never land here. The first navigation is the launch itself, when the
    // room is already open on purpose.
    let initialNavigation = true;
    win.webContents.on('did-navigate', () => {
      if (initialNavigation) {
        initialNavigation = false;
        return;
      }
      if (fullscreen.expanded) fullscreen.exit();
    });
    win.webContents.on('did-start-loading', () => {
      this.rendererReady = false;
    });
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error('[ascua] renderer failed', code, description, url);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[ascua] renderer gone', details);
    });

    win.on('enter-full-screen', () => fullscreen.onEnterFullScreen());
    win.on('leave-full-screen', () => fullscreen.onLeaveFullScreen());
    win.on('close', () => fullscreen.markClosing());
    win.on('minimize', () => fullscreen.onMinimize());

    win.on('moved', () => this.scheduleSave());
    win.on('closed', () => {
      clickThrough.stop();
      positions.dispose();
      this.drag?.stop();
      this.clickThrough = null;
      this.drag = null;
      this.fullscreen = null;
      this.win = null;
    });

    hardenWebContents(win);
    // Launch into the room: the compact avatar is the collapsed state.
    fullscreen.startExpanded();
    clickThrough.apply();
    loadRenderer(win);
    clickThrough.start();
    this.send(IPC.layoutChanged, this.layout);
    return win;
  }

  /** Wires the permission bridge; call before `create()`. */
  bindPermissions(permissions: PermissionBridge): void {
    this.permissions = permissions;
  }

  get isRendererReady(): boolean {
    return this.rendererReady;
  }

  get window(): BrowserWindow | null {
    return this.win;
  }

  /** Re-evaluates click-through (the permission bubble changed). */
  refreshInteraction(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.clickThrough?.apply();
  }

  toggleFullscreen(): BloomOrigin {
    return this.fullscreen?.toggle() ?? ZERO_ORIGIN;
  }

  exitFullscreen(): void {
    this.fullscreen?.exit();
  }

  isFullscreen(): boolean {
    return this.fullscreen?.isFullscreen() ?? false;
  }

  /** The room state a renderer reads when it boots. */
  state(): FullscreenState {
    return this.fullscreen?.state() ?? { fullscreen: false };
  }

  startDrag(): void {
    if (!this.win || !this.drag || this.drag.active) return;
    this.drag.start();
    this.clickThrough?.apply();
  }

  endDrag(): void {
    this.drag?.end();
  }

  send(channel: string, payload: unknown): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.webContents.send(channel, payload);
  }

  private scheduleSave(): void {
    this.positions?.scheduleSave(() => {
      if (!this.win || this.win.isDestroyed() || this.fullscreen?.expanded) {
        return undefined;
      }
      return this.win.getBounds();
    });
  }
}
