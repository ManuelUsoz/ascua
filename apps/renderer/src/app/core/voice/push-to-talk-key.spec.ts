import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RoomState } from '../room/room-state';
import { isPushToTalkDown, PushToTalkKey } from './push-to-talk-key';
import { VoiceStore } from './voice-store';

function key(type: string, init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
}

describe('PushToTalkKey', () => {
  const open = signal(true);
  const enabled = signal(true);
  const voice = {
    enabled,
    pressStart: vi.fn(),
    pressEnd: vi.fn(async () => undefined),
    cancelListening: vi.fn(),
  };

  beforeAll(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: RoomState, useValue: { open } },
        { provide: VoiceStore, useValue: voice },
      ],
    });
    TestBed.inject(PushToTalkKey).start();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    open.set(true);
    enabled.set(true);
  });

  it('recognises only a fresh Ctrl+Space', () => {
    expect(
      isPushToTalkDown(key('keydown', { ctrlKey: true, code: 'Space' })),
    ).toBe(true);
    expect(
      isPushToTalkDown(
        key('keydown', { ctrlKey: true, code: 'Space', repeat: true }),
      ),
    ).toBe(false);
    expect(
      isPushToTalkDown(
        key('keydown', { ctrlKey: true, altKey: true, code: 'Space' }),
      ),
    ).toBe(false);
    expect(isPushToTalkDown(key('keydown', { code: 'Space' }))).toBe(false);
  });

  it('presses on keydown, ignores repeat, releases on keyup', () => {
    const down = key('keydown', { ctrlKey: true, code: 'Space' });
    window.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    window.dispatchEvent(
      key('keydown', { ctrlKey: true, code: 'Space', repeat: true }),
    );
    expect(voice.pressStart).toHaveBeenCalledTimes(1);
    window.dispatchEvent(key('keyup', { code: 'Space' }));
    expect(voice.pressEnd).toHaveBeenCalledTimes(1);
  });

  it('releases when Ctrl is lifted first', () => {
    window.dispatchEvent(key('keydown', { ctrlKey: true, code: 'Space' }));
    window.dispatchEvent(key('keyup', { key: 'Control', code: 'ControlLeft' }));
    expect(voice.pressEnd).toHaveBeenCalledTimes(1);
  });

  it('cancels on blur', () => {
    window.dispatchEvent(key('keydown', { ctrlKey: true, code: 'Space' }));
    window.dispatchEvent(new Event('blur'));
    expect(voice.cancelListening).toHaveBeenCalledTimes(1);
  });

  it('is inactive in compact mode and when disabled', () => {
    open.set(false);
    window.dispatchEvent(key('keydown', { ctrlKey: true, code: 'Space' }));
    open.set(true);
    enabled.set(false);
    window.dispatchEvent(key('keydown', { ctrlKey: true, code: 'Space' }));
    expect(voice.pressStart).not.toHaveBeenCalled();
  });
});
