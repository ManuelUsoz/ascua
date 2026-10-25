import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '@ascua/ipc';
import { COMPACT, type Rect } from './geometry';
import { FullscreenController } from './fullscreen';
import { nativeMode, pseudoMode, type FullscreenMode } from './fullscreen-mode';
import type { FullscreenWindowPort, ScreenPort } from './ports';

const DISPLAY: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const START: Rect = { x: 1500, y: 760, ...COMPACT };

function setup(mode: FullscreenMode = nativeMode) {
  let bounds: Rect = { ...START };
  const win = {
    getBounds: vi.fn(() => bounds),
    setBounds: vi.fn((b: Rect) => {
      bounds = { ...b };
    }),
    isDestroyed: vi.fn(() => false),
    setFocusable: vi.fn(),
    setMinimizable: vi.fn(),
    setResizable: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setFullScreen: vi.fn(),
    isFullScreen: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    focus: vi.fn(),
    restore: vi.fn(),
    showInactive: vi.fn(),
    moveTop: vi.fn(),
  };
  const screen = {
    getDisplayMatching: vi.fn(() => ({ bounds: DISPLAY })),
  };
  const send = vi.fn();
  const controller = new FullscreenController({
    win: win as unknown as FullscreenWindowPort,
    screen: screen as unknown as ScreenPort,
    layout: { left: false, top: false },
    mode,
    send,
    applyInteraction: vi.fn(),
    forceInteraction: vi.fn(),
    fallbackBounds: () => START,
  });
  return {
    win,
    send,
    controller,
    setBounds: (b: Rect) => {
      bounds = b;
    },
  };
}

describe('FullscreenController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('announces fullscreen only once the bounds cover the display', () => {
    const { controller, send, setBounds } = setup();
    const origin = controller.toggle();
    expect(controller.expanded).toBe(true);

    vi.advanceTimersByTime(50);
    expect(send).not.toHaveBeenCalled();

    setBounds(DISPLAY);
    vi.advanceTimersByTime(20);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(IPC.fullscreenChanged, {
      fullscreen: true,
      origin,
    });
  });

  it('announces anyway after the 1200 ms cap', () => {
    const { controller, send } = setup();
    controller.toggle();
    vi.advanceTimersByTime(1300);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('starts expanded without announcing a bloom', () => {
    const { controller, send, win } = setup();
    expect(controller.state()).toEqual({ fullscreen: false });

    controller.startExpanded();
    expect(controller.expanded).toBe(true);
    expect(win.setFocusable).toHaveBeenCalledWith(true);
    expect(win.setMinimizable).toHaveBeenCalledWith(true);
    expect(controller.state()).toEqual({
      fullscreen: true,
      origin: { x: 1800, y: 960, size: 120, width: 1920, height: 1080 },
    });

    // The native event arrives before any renderer can listen: stay silent.
    controller.onEnterFullScreen();
    vi.advanceTimersByTime(1300);
    expect(send).not.toHaveBeenCalled();
  });

  it('exit restores the compact bounds and announces later', () => {
    const { controller, send, win, setBounds } = setup();
    controller.toggle();
    setBounds(DISPLAY);
    vi.advanceTimersByTime(20);
    send.mockClear();

    controller.exit();
    expect(controller.expanded).toBe(false);
    expect(win.setFullScreen).toHaveBeenLastCalledWith(false);
    expect(win.getBounds()).toEqual(START);
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(true, 'floating');
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60);
    expect(send).toHaveBeenCalledWith(IPC.fullscreenChanged, {
      fullscreen: false,
    });
  });

  it('pseudo mode sets the display bounds and locks resizing on leave', () => {
    const { controller, win } = setup(pseudoMode);
    controller.toggle();
    expect(win.setResizable).toHaveBeenCalledWith(true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
    expect(win.getBounds()).toEqual(DISPLAY);
    expect(win.setFullScreen).not.toHaveBeenCalled();
    expect(controller.isFullscreen()).toBe(true);

    controller.exit();
    expect(win.setResizable).toHaveBeenLastCalledWith(false);
    expect(controller.isFullscreen()).toBe(false);
  });

  it('ignores leave-full-screen while closing', () => {
    const { controller, send, win } = setup();
    controller.toggle();
    vi.advanceTimersByTime(1300);
    send.mockClear();
    win.setBounds.mockClear();

    controller.markClosing();
    controller.onLeaveFullScreen();
    expect(controller.expanded).toBe(true);
    expect(win.setBounds).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('leave-full-screen collapses an expanded room', () => {
    const { controller, send } = setup();
    controller.toggle();
    vi.advanceTimersByTime(1300);
    send.mockClear();

    controller.onLeaveFullScreen();
    expect(controller.expanded).toBe(false);
    expect(send).toHaveBeenCalledWith(IPC.fullscreenChanged, {
      fullscreen: false,
    });
  });

  it('minimize collapses first and restores the avatar after 40 ms', () => {
    const { controller, send, win } = setup();
    controller.toggle();
    vi.advanceTimersByTime(1300);
    send.mockClear();

    controller.onMinimize();
    expect(send).toHaveBeenCalledWith(IPC.fullscreenChanged, {
      fullscreen: false,
    });
    expect(win.restore).not.toHaveBeenCalled();

    vi.advanceTimersByTime(40);
    expect(win.restore).toHaveBeenCalled();
    expect(win.showInactive).toHaveBeenCalled();
  });
});
