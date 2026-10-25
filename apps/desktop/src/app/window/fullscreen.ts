import {
  IPC,
  type BloomOrigin,
  type FullscreenState,
  type Layout,
} from '@ascua/ipc';
import {
  AVATAR,
  bloomOrigin,
  COMPACT,
  coversDisplay,
  type Point,
  type Rect,
} from './geometry';
import type { FullscreenMode } from './fullscreen-mode';
import type { FullscreenWindowPort, ScreenPort } from './ports';

export interface FullscreenOptions {
  win: FullscreenWindowPort;
  screen: ScreenPort;
  layout: Layout;
  mode: FullscreenMode;
  send: (channel: string, payload: unknown) => void;
  /** Re-evaluates click-through after `expanded` changed. */
  applyInteraction: () => void;
  /** Re-issues the click-through state (stale after minimize/restore). */
  forceInteraction: () => void;
  /** Compact bounds to fall back to when none were captured. */
  fallbackBounds: () => Point;
}

/**
 * The room is a fullscreen state of the one window. `expanded` is the source
 * of truth: on Windows `isFullScreen()` can be false while the bounds already
 * cover the display, and fullscreen is announced only once they do.
 */
export class FullscreenController {
  private expandedState = false;
  private compactBounds: Rect | null = null;
  private pendingOrigin: BloomOrigin | undefined;
  private openedOrigin: BloomOrigin | undefined;
  private announced = false;
  private closing = false;

  constructor(private readonly options: FullscreenOptions) {}

  get expanded(): boolean {
    return this.expandedState;
  }

  isFullscreen(): boolean {
    const { win, mode } = this.options;
    if (win.isDestroyed()) return false;
    return mode.isFullscreen(win, this.expandedState);
  }

  /** The room's state for a renderer that booted after main opened it. */
  state(): FullscreenState {
    if (!this.expandedState) return { fullscreen: false };
    const origin = this.openedOrigin ?? this.bloomOrigin();
    return { fullscreen: true, origin };
  }

  /**
   * Opens the room on launch, before the renderer exists: no bloom and no
   * `fullscreenChanged` event. The renderer reads `state()` when it boots.
   */
  startExpanded(): void {
    const { win, screen, mode } = this.options;
    if (win.isDestroyed() || this.expandedState) return;

    const compact = win.getBounds();
    const display = screen.getDisplayMatching(compact);
    this.compactBounds = compact;
    this.openedOrigin = bloomOrigin(
      compact,
      display.bounds,
      this.options.layout,
    );
    this.pendingOrigin = undefined;
    // `onEnterFullScreen` must not announce to a renderer that isn't there yet.
    this.announced = true;
    this.expandedState = true;
    win.setFocusable(true);
    win.setMinimizable(true);
    mode.enter(win, display);
    win.focus();
  }

  /** The avatar's position on its display, for the renderer's bloom origin. */
  bloomOrigin(): BloomOrigin {
    const { win, screen, layout } = this.options;
    if (win.isDestroyed()) {
      return { x: 0, y: 0, size: AVATAR, width: 0, height: 0 };
    }
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    return bloomOrigin(bounds, display.bounds, layout);
  }

  toggle(): BloomOrigin {
    const { win, screen, mode } = this.options;
    const origin = this.bloomOrigin();
    if (win.isDestroyed() || this.expandedState) return origin;

    this.compactBounds = win.getBounds();
    this.pendingOrigin = origin;
    this.openedOrigin = origin;
    this.announced = false;
    this.expandedState = true;
    win.setFocusable(true);
    win.setMinimizable(true);
    mode.enter(win, screen.getDisplayMatching(this.compactBounds));
    win.focus();
    this.announce(origin);

    return origin;
  }

  exit(): void {
    const { win, send } = this.options;
    if (win.isDestroyed()) return;
    this.expandedState = false;
    this.announced = false;
    this.pendingOrigin = undefined;
    win.setFullScreen(false);
    this.restoreCompactBounds();
    this.options.applyInteraction();
    setTimeout(() => {
      if (!win.isDestroyed())
        send(IPC.fullscreenChanged, { fullscreen: false });
    }, 60);
  }

  onEnterFullScreen(): void {
    this.expandedState = true;
    this.options.applyInteraction();
    this.announce(this.pendingOrigin ?? this.bloomOrigin());
  }

  /**
   * Closing a fullscreen window on Windows first leaves fullscreen; never
   * resurrect the window there, the close must finish.
   */
  onLeaveFullScreen(): void {
    if (this.closing || !this.expandedState) return;
    this.expandedState = false;
    this.pendingOrigin = undefined;
    this.announced = false;
    this.restoreCompactBounds();
    this.options.applyInteraction();
    this.options.send(IPC.fullscreenChanged, { fullscreen: false });
  }

  markClosing(): void {
    this.closing = true;
  }

  /** Windows leaves fullscreen while minimizing. */
  onMinimize(): void {
    if (this.closing) return;
    if (this.expandedState) {
      this.collapseFromMinimize();
      return;
    }
    // Compact windows are unminimizable; if the OS minimized one anyway
    // (e.g. right after a collapse), bring the avatar back.
    setTimeout(() => this.showIfMinimized(), 120);
  }

  /**
   * Minimizing a fullscreen room on Windows leaves fullscreen behind the
   * scenes. Land the renderer on the compact frame while the window is still
   * hidden, give it a beat to paint it, then restore the window as the
   * resting avatar: no flux, no taskbar-icon flip.
   */
  collapseFromMinimize(): void {
    const { win } = this.options;
    this.expandedState = false;
    this.pendingOrigin = undefined;
    this.announced = false;
    this.options.send(IPC.fullscreenChanged, { fullscreen: false });
    // A minimized window doesn't repaint; this beat lets the compact frame
    // land before the window comes back on screen.
    setTimeout(() => {
      if (win.isDestroyed()) return;
      win.restore();
      win.setFullScreen(false);
      this.restoreCompactBounds();
      win.showInactive();
      win.moveTop();
      this.options.forceInteraction();
    }, 40);
  }

  restoreCompactBounds(): void {
    const { win, mode } = this.options;
    if (win.isDestroyed()) return;
    const bounds = this.compactBounds ?? this.options.fallbackBounds();
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: COMPACT.width,
      height: COMPACT.height,
    });
    win.setFocusable(false);
    win.setMinimizable(false);
    mode.leave(win);
    win.setAlwaysOnTop(true, 'floating');
  }

  /**
   * Windows may report the enter-full-screen event before the window has been
   * resized to the display. Announce only once the bounds cover the display so
   * the renderer's bloom starts in a fullscreen viewport.
   */
  announce(origin: BloomOrigin): void {
    if (this.announced) return;
    const { win, screen, send } = this.options;
    const started = Date.now();
    const check = () => {
      if (win.isDestroyed() || !this.expandedState) return;
      const bounds = win.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const full = coversDisplay(bounds, display.bounds);
      if (full || Date.now() - started > 1200) {
        if (this.announced) return;
        this.announced = true;
        send(IPC.fullscreenChanged, { fullscreen: true, origin });
      } else {
        setTimeout(check, 16);
      }
    };
    setTimeout(check, 0);
  }

  private showIfMinimized(): void {
    const { win } = this.options;
    if (win.isDestroyed() || !win.isMinimized()) return;
    win.restore();
    win.showInactive();
    win.moveTop();
    this.options.forceInteraction();
  }
}
