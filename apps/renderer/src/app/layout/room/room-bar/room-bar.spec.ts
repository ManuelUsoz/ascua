import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RoomState } from '../../../core/room/room-state';
import { UnsavedChanges } from '../../../core/unsaved/unsaved-changes';
import { i18nTesting } from '../../../testing/i18n';
import { RoomBar } from './room-bar';

describe('RoomBar', () => {
  const room = { close: vi.fn(), collapse: vi.fn() };

  function render() {
    TestBed.configureTestingModule({
      imports: [RoomBar, i18nTesting()],
      providers: [provideRouter([]), { provide: RoomState, useValue: room }],
    });
    const fixture = TestBed.createComponent(RoomBar);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const button = (label: string) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    return { el, button, unsaved: TestBed.inject(UnsavedChanges) };
  }

  beforeEach(() => vi.clearAllMocks());

  it('labels the window buttons in Spanish', () => {
    const { button } = render();
    expect(button('Minimizar')).not.toBeNull();
    expect(button('Cerrar')).not.toBeNull();
  });

  it('closes at once when nothing is unsaved', async () => {
    const { button } = render();
    button('Cerrar')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(room.close).toHaveBeenCalledTimes(1);
  });

  it('waits for the answer when there are unsaved changes', async () => {
    const { button, unsaved } = render();
    unsaved.dirty.set(true);
    button('Cerrar')?.click();
    await Promise.resolve();
    expect(room.close).not.toHaveBeenCalled();
    expect(unsaved.prompt()).toBeDefined();

    unsaved.answer(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(room.close).not.toHaveBeenCalled();

    button('Cerrar')?.click();
    unsaved.answer(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(room.close).toHaveBeenCalledTimes(1);
  });

  it('minimizes by collapsing the room', () => {
    const { button } = render();
    button('Minimizar')?.click();
    expect(room.collapse).toHaveBeenCalledTimes(1);
    expect(room.close).not.toHaveBeenCalled();
  });
});
