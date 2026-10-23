import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RoomState } from '../../core/room/room-state';
import { Room } from './room';

describe('Room', () => {
  const room = {
    open: signal(false),
    collapse: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    room.open.set(false);
    room.collapse.mockClear();
    room.close.mockClear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: RoomState, useValue: room }],
    });
  });

  const button = (element: HTMLElement, label: string) => {
    const found = element.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!found) throw new Error(`no "${label}" button`);
    return found;
  };

  async function render() {
    const fixture = TestBed.createComponent(Room);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('is hidden from assistive tech until the room is open', async () => {
    const { fixture, element } = await render();
    expect(element.querySelector('#room')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    room.open.set(true);
    await fixture.whenStable();
    expect(element.querySelector('#room')?.getAttribute('aria-hidden')).toBe(
      'false',
    );
  });

  it('minimizes back to the avatar and closes Ascua', async () => {
    const { element } = await render();
    button(element, 'Minimize').click();
    expect(room.collapse).toHaveBeenCalledTimes(1);
    button(element, 'Close').click();
    await Promise.resolve();
    expect(room.close).toHaveBeenCalledTimes(1);
  });

  it('keeps the ring and the twelve embers the CSS animates', async () => {
    const { element } = await render();
    expect(element.querySelector('#room-ring')).not.toBeNull();
    expect(element.querySelectorAll('#room-embers .ember')).toHaveLength(12);
  });
});
