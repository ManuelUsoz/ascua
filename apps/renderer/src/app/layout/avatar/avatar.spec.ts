import { TestBed } from '@angular/core/testing';
import { Companion } from '../../core/companion/companion';
import { RoomState } from '../../core/room/room-state';
import { VoiceStore } from '../../core/voice/voice-store';
import { Avatar } from './avatar';

describe('Avatar push-to-talk', () => {
  const room = {
    isCompact: () => true,
    open: () => false,
    anchor: vi.fn(),
    dragStart: vi.fn(),
    dragEnd: vi.fn(),
    expand: vi.fn(),
  };
  const companion = { attach: vi.fn(), poke: vi.fn() };
  const voice = {
    enabled: vi.fn(() => true),
    pressStart: vi.fn(),
    pressEnd: vi.fn(() => Promise.resolve()),
    cancelListening: vi.fn(),
  };

  function setup() {
    TestBed.configureTestingModule({
      imports: [Avatar],
      providers: [
        { provide: RoomState, useValue: room },
        { provide: Companion, useValue: companion },
        { provide: VoiceStore, useValue: voice },
      ],
    });
    const fixture = TestBed.createComponent(Avatar);
    fixture.detectChanges();
    const host = (fixture.nativeElement as HTMLElement).querySelector(
      '#ascua-host',
    ) as HTMLElement;
    host.setPointerCapture = vi.fn();
    host.releasePointerCapture = vi.fn();
    host.hasPointerCapture = () => false;
    return host;
  }

  function fire(host: HTMLElement, type: string, x = 0, buttons = 1) {
    const e = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      buttons,
      screenX: x,
      screenY: 0,
    });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    host.dispatchEvent(e);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    voice.enabled.mockReturnValue(true);
  });
  afterEach(() => vi.useRealTimers());

  it('listens after a long press and does not poke on release', () => {
    const host = setup();
    fire(host, 'pointerdown');
    vi.advanceTimersByTime(449);
    expect(voice.pressStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(voice.pressStart).toHaveBeenCalledTimes(1);
    fire(host, 'pointerup', 0, 0);
    host.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(voice.pressEnd).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(companion.poke).not.toHaveBeenCalled();
  });

  it('drags and never listens when it moves before the hold fires', () => {
    const host = setup();
    fire(host, 'pointerdown');
    vi.advanceTimersByTime(200);
    fire(host, 'pointermove', 10);
    expect(room.dragStart).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(voice.pressStart).not.toHaveBeenCalled();
  });

  it('never drags once listening', () => {
    const host = setup();
    fire(host, 'pointerdown');
    vi.advanceTimersByTime(500);
    fire(host, 'pointermove', 40);
    expect(room.dragStart).not.toHaveBeenCalled();
  });

  it('cancels listening on pointercancel', () => {
    const host = setup();
    fire(host, 'pointerdown');
    vi.advanceTimersByTime(500);
    fire(host, 'pointercancel', 0, 0);
    expect(voice.cancelListening).toHaveBeenCalled();
    expect(voice.pressEnd).not.toHaveBeenCalled();
  });

  it('keeps click to poke and double-click to expand', () => {
    const host = setup();
    fire(host, 'pointerdown');
    vi.advanceTimersByTime(100);
    fire(host, 'pointerup', 0, 0);
    host.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    vi.advanceTimersByTime(500);
    expect(companion.poke).toHaveBeenCalledTimes(1);
    expect(voice.pressStart).not.toHaveBeenCalled();
    host.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(room.expand).toHaveBeenCalled();
  });

  it('ignores the hold when voice is disabled', () => {
    voice.enabled.mockReturnValue(false);
    const host = setup();
    fire(host, 'pointerdown');
    vi.advanceTimersByTime(1000);
    expect(voice.pressStart).not.toHaveBeenCalled();
  });
});
