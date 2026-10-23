import { clampToArea, dragBounds } from './geometry';
import type { ScreenPort, WindowPort } from './ports';

const DRAG_INTERVAL_MS = 16;

export interface WindowDragOptions {
  win: WindowPort;
  screen: ScreenPort;
  /** Runs after a drag ends and the window is back inside the work area. */
  onEnd: () => void;
}

/** Custom window drag: samples the cursor and moves the window with it. */
export class WindowDrag {
  private timer: NodeJS.Timeout | undefined;
  private dragging = false;

  constructor(private readonly options: WindowDragOptions) {}

  get active(): boolean {
    return this.dragging;
  }

  start(): void {
    if (this.dragging) return;
    const { win, screen } = this.options;
    this.dragging = true;

    const startCursor = screen.getCursorScreenPoint();
    const startBounds = win.getBounds();

    this.timer = setInterval(() => {
      if (win.isDestroyed()) return;
      win.setBounds(
        dragBounds(startBounds, startCursor, screen.getCursorScreenPoint()),
      );
    }, DRAG_INTERVAL_MS);
  }

  end(): void {
    this.stop();
    const { win, screen, onEnd } = this.options;
    if (win.isDestroyed()) return;
    const bounds = win.getBounds();
    const clamped = clampToArea(
      bounds,
      screen.getDisplayMatching(bounds).workArea,
    );
    if (clamped.x !== bounds.x || clamped.y !== bounds.y)
      win.setBounds(clamped);
    onEnd();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.dragging = false;
  }
}
