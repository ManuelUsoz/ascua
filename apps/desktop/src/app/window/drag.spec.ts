import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowDrag } from './drag';
import type { ScreenPort, WindowPort } from './ports';

function setup() {
  const cursor = { x: 500, y: 500 };
  const bounds = { x: 100, y: 100, width: 420, height: 320 };
  const setBounds = vi.fn((next: typeof bounds) => Object.assign(bounds, next));
  const win = {
    getBounds: () => ({ ...bounds }),
    setBounds,
    isDestroyed: () => false,
    setIgnoreMouseEvents: vi.fn(),
  } as unknown as WindowPort;
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
  const screen = {
    getCursorScreenPoint: () => ({ ...cursor }),
    getDisplayMatching: () => ({ workArea }),
  } as unknown as ScreenPort;
  const onEnd = vi.fn();
  const drag = new WindowDrag({ win, screen, onEnd });
  return { drag, cursor, bounds, setBounds, onEnd };
}

describe('WindowDrag', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('follows the cursor every 16 ms', () => {
    const { drag, cursor, setBounds } = setup();
    drag.start();
    expect(drag.active).toBe(true);
    cursor.x = 540;
    cursor.y = 520;
    vi.advanceTimersByTime(16);
    expect(setBounds).toHaveBeenLastCalledWith({
      x: 140,
      y: 120,
      width: 420,
      height: 320,
    });
    drag.stop();
    expect(drag.active).toBe(false);
  });

  it('end clamps into the work area, then calls onEnd', () => {
    const { drag, cursor, bounds, onEnd } = setup();
    drag.start();
    cursor.x = -300;
    cursor.y = 500;
    vi.advanceTimersByTime(16);
    drag.end();
    expect(bounds.x).toBe(0);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(drag.active).toBe(false);
    const calls = vi.getTimerCount();
    expect(calls).toBe(0);
  });

  it('a second start while active is ignored', () => {
    const { drag } = setup();
    drag.start();
    drag.start();
    expect(vi.getTimerCount()).toBe(1);
    drag.stop();
  });
});
