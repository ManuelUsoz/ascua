import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { Companion } from '../../core/companion/companion';
import { RoomState } from '../../core/room/room-state';
import { Avatar } from './avatar';

describe('Avatar', () => {
  let api: {
    dragStart: ReturnType<typeof vi.fn>;
    dragEnd: ReturnType<typeof vi.fn>;
  };
  let companion: {
    attach: ReturnType<typeof vi.fn>;
    poke: ReturnType<typeof vi.fn>;
  };
  let room: {
    open: ReturnType<typeof signal<boolean>>;
    compact: boolean;
    isCompact: () => boolean;
    anchor: ReturnType<typeof vi.fn>;
    expand: ReturnType<typeof vi.fn>;
  };
  let host: HTMLElement;

  const fire = (type: string, init: MouseEventInit = {}) =>
    host.dispatchEvent(
      new MouseEvent(type, { bubbles: true, button: 0, ...init }),
    );

  beforeEach(async () => {
    api = {
      dragStart: vi.fn(async () => undefined),
      dragEnd: vi.fn(async () => undefined),
    };
    companion = { attach: vi.fn(), poke: vi.fn() };
    room = {
      open: signal(false),
      compact: true,
      isCompact: () => room.compact,
      anchor: vi.fn(),
      expand: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ASCUA_API, useValue: api },
        { provide: Companion, useValue: companion },
        { provide: RoomState, useValue: room },
      ],
    });
    const fixture = TestBed.createComponent(Avatar);
    await fixture.whenStable();
    const found = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLElement>('#ascua-host');
    if (!found) throw new Error('#ascua-host was not rendered');
    host = found;
    host.setPointerCapture = vi.fn();
    host.hasPointerCapture = vi.fn(() => false);
    host.releasePointerCapture = vi.fn();
  });

  afterEach(() => vi.useRealTimers());

  it('mounts the character, starts its life and anchors the room on it', () => {
    expect(host.querySelector('.ascua')).not.toBeNull();
    expect(companion.attach).toHaveBeenCalledTimes(1);
    expect(room.anchor).toHaveBeenCalledWith(host);
  });

  it('pokes once the double-click interval has passed', () => {
    vi.useFakeTimers();
    fire('click', { detail: 1 });
    vi.advanceTimersByTime(499);
    expect(companion.poke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(companion.poke).toHaveBeenCalledTimes(1);
  });

  it('opens the room on double-click without poking', () => {
    vi.useFakeTimers();
    fire('click', { detail: 1 });
    fire('click', { detail: 2 });
    fire('dblclick', { detail: 2 });
    expect(room.expand).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(companion.poke).not.toHaveBeenCalled();
  });

  it('drags only past 4 px, and the release does not poke', () => {
    vi.useFakeTimers();
    fire('pointerdown', { screenX: 100, screenY: 100, buttons: 1 });
    fire('pointermove', { screenX: 103, screenY: 100, buttons: 1 });
    expect(api.dragStart).not.toHaveBeenCalled();
    fire('pointermove', { screenX: 110, screenY: 100, buttons: 1 });
    fire('pointermove', { screenX: 140, screenY: 100, buttons: 1 });
    expect(api.dragStart).toHaveBeenCalledTimes(1);
    fire('pointerup', { screenX: 140, screenY: 100 });
    expect(api.dragEnd).toHaveBeenCalledTimes(1);
    fire('click', { detail: 1 });
    vi.advanceTimersByTime(1000);
    expect(companion.poke).not.toHaveBeenCalled();
  });

  it('ignores presses while the room is open or closing', () => {
    room.compact = false;
    fire('pointerdown', { screenX: 100, screenY: 100, buttons: 1 });
    fire('pointermove', { screenX: 200, screenY: 100, buttons: 1 });
    expect(api.dragStart).not.toHaveBeenCalled();
  });
});
