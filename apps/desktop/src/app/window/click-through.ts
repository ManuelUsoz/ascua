import type { Layout } from '@ascua/ipc';
import { hitsAvatar } from './geometry';
import type { ScreenPort, WindowPort } from './ports';

const POLL_MS = 40;

export interface ClickThroughOptions {
  win: WindowPort;
  screen: ScreenPort;
  layout: Layout;
  /** True while the whole window must take the mouse (room open, bubble, drag). */
  forced: () => boolean;
}

/**
 * In compact mode the window ignores the mouse except over the avatar; this
 * polls the cursor and flips `setIgnoreMouseEvents` accordingly.
 */
export class ClickThrough {
  private interactive = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly options: ClickThroughOptions) {}

  start(): void {
    this.stop();
    const { win, screen, layout, forced } = this.options;
    this.timer = setInterval(() => {
      if (win.isDestroyed()) return;
      if (forced()) {
        this.set(true);
        return;
      }
      this.set(
        hitsAvatar(screen.getCursorScreenPoint(), win.getBounds(), layout),
      );
    }, POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  set(interactive: boolean): void {
    if (this.options.win.isDestroyed()) return;
    if (interactive === this.interactive) return;
    this.interactive = interactive;
    this.options.win.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  apply(): void {
    this.set(this.options.forced());
  }

  /**
   * `setIgnoreMouseEvents` can go stale across a minimize/restore on Windows;
   * always re-issue the current state.
   */
  force(): void {
    this.interactive = !this.interactive;
    this.apply();
  }
}
