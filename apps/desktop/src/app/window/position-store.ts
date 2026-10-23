import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaultPosition, isRestorable, type Point } from './geometry';
import type { ScreenPort } from './ports';

const SAVE_DELAY_MS = 600;

/** Remembers where the avatar window sits (best-effort, debounced). */
export class PositionStore {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly file: string,
    private readonly screen: ScreenPort,
  ) {}

  restore(): Point {
    try {
      if (existsSync(this.file)) {
        const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Point;
        const workAreas = this.screen
          .getAllDisplays()
          .map((display) => display.workArea);
        if (isRestorable(saved, workAreas)) return { x: saved.x, y: saved.y };
      }
    } catch {
      // Fall through to the default spot.
    }

    return defaultPosition(this.screen.getPrimaryDisplay().workArea);
  }

  /** `current` is read when the timer fires; return undefined to skip the write. */
  scheduleSave(current: () => Point | undefined): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const position = current();
      if (!position) return;
      try {
        mkdirSync(dirname(this.file), { recursive: true });
        writeFileSync(
          this.file,
          JSON.stringify({ x: position.x, y: position.y }),
        );
      } catch {
        // Position persistence is best-effort.
      }
    }, SAVE_DELAY_MS);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
