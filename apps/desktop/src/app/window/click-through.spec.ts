import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClickThrough } from './click-through';
import type { ScreenPort, WindowPort } from './ports';

function setup() {
  const cursor = { x: 0, y: 0 };
  const state = { forced: false, destroyed: false };
  const setIgnoreMouseEvents = vi.fn();
  const win = {
    getBounds: () => ({ x: 100, y: 100, width: 420, height: 320 }),
    setBounds: vi.fn(),
    isDestroyed: () => state.destroyed,
    setIgnoreMouseEvents,
  } as unknown as WindowPort;
  const screen = {
    getCursorScreenPoint: () => cursor,
  } as unknown as ScreenPort;
  const click = new ClickThrough({
    win,
    screen,
    layout: { left: false, top: false },
    forced: () => state.forced,
  });
  return { click, cursor, state, setIgnoreMouseEvents };
}

describe('ClickThrough', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('turns interactive only over the avatar, once per change', () => {
    const { click, cursor, setIgnoreMouseEvents } = setup();
    click.start();
    vi.advanceTimersByTime(40);
    expect(setIgnoreMouseEvents).not.toHaveBeenCalled();

    // Avatar square is x 400..520, y 300..420.
    cursor.x = 450;
    cursor.y = 350;
    vi.advanceTimersByTime(40);
    vi.advanceTimersByTime(40);
    expect(setIgnoreMouseEvents).toHaveBeenCalledTimes(1);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, {
      forward: true,
    });

    cursor.x = 0;
    vi.advanceTimersByTime(40);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, {
      forward: true,
    });
    click.stop();
  });

  it('stays interactive while forced', () => {
    const { click, state, setIgnoreMouseEvents } = setup();
    state.forced = true;
    click.apply();
    expect(setIgnoreMouseEvents).toHaveBeenCalledWith(false, { forward: true });
  });

  it('force re-issues the current state', () => {
    const { click, setIgnoreMouseEvents } = setup();
    click.force();
    expect(setIgnoreMouseEvents).toHaveBeenCalledTimes(1);
    expect(setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, {
      forward: true,
    });
  });

  it('never touches a destroyed window', () => {
    const { click, state, setIgnoreMouseEvents } = setup();
    state.destroyed = true;
    state.forced = true;
    click.apply();
    click.force();
    expect(setIgnoreMouseEvents).not.toHaveBeenCalled();
  });

  it('stop ends the polling', () => {
    const { click, cursor, setIgnoreMouseEvents } = setup();
    click.start();
    click.stop();
    cursor.x = 450;
    cursor.y = 350;
    vi.advanceTimersByTime(200);
    expect(setIgnoreMouseEvents).not.toHaveBeenCalled();
  });
});
