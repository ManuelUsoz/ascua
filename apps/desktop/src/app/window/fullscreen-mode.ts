import type { Display } from 'electron';
import type { FullscreenWindowPort } from './ports';

/** How the room covers the display: native fullscreen, or plain bounds. */
export interface FullscreenMode {
  enter(win: FullscreenWindowPort, display: Pick<Display, 'bounds'>): void;
  /** Called while restoring the compact bounds. */
  leave(win: FullscreenWindowPort): void;
  isFullscreen(win: FullscreenWindowPort, expanded: boolean): boolean;
}

export const nativeMode: FullscreenMode = {
  enter(win) {
    win.setAlwaysOnTop(false);
    win.setResizable(false);
    win.setFullScreen(true);
  },
  leave() {
    // `setFullScreen(false)` is issued by the controller on every platform.
  },
  isFullscreen: (win) => win.isFullScreen(),
};

/**
 * Linux only (see the AGENTS.md note on Linux fullscreen). X11 WMs often
 * ignore or undo fullscreen for a window created non-focusable, and Electron
 * then drops setBounds while it believes it is fullscreen. Cover the display
 * with plain bounds instead. A non-resizable X11 window has fixed size
 * hints, so allow resizing while expanded.
 */
export const pseudoMode: FullscreenMode = {
  enter(win, display) {
    win.setResizable(true);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setBounds(display.bounds);
  },
  /** Locks the window size again after the pseudo fullscreen. */
  leave(win) {
    win.setResizable(false);
  },
  isFullscreen: (_win, expanded) => expanded,
};

export function fullscreenModeFor(platform: NodeJS.Platform): FullscreenMode {
  return platform === 'linux' ? pseudoMode : nativeMode;
}
