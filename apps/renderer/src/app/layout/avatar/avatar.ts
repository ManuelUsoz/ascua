import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { live, type Ascua } from '@ascua/character';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { Companion } from '../../core/companion/companion';
import { RoomState } from '../../core/room/room-state';
import { Character } from '../../shared/character/character';

/** Windows' default double-click interval: wait this long before poking. */
const DBL_MS = 500;
/** Movement beyond this starts an OS window drag instead of a click. */
const DRAG_PX = 4;

/**
 * The avatar. In compact mode main keeps the window click-through except over
 * this square, so every gesture lands here: poke, drag, double-click to open
 * the room. Dragging is custom (see AGENTS.md); never use an app-region.
 */
@Component({
  selector: 'app-avatar',
  imports: [Character],
  templateUrl: './avatar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avatar {
  protected readonly room = inject(RoomState);
  private readonly companion = inject(Companion);
  private readonly api = inject(ASCUA_API);
  private readonly host = viewChild.required<string, ElementRef<HTMLElement>>(
    'host',
    {
      read: ElementRef,
    },
  );

  private press?: { x: number; y: number; dragging: boolean };
  private dragged = false;
  private pokeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => this.room.anchor(this.host().nativeElement));
    inject(DestroyRef).onDestroy(() => this.clearPoke());
  }

  protected mounted(ascua: Ascua): void {
    this.companion.attach(live(ascua));
  }

  protected pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.room.isCompact()) return;
    this.press = { x: event.screenX, y: event.screenY, dragging: false };
    this.dragged = false;
    this.host().nativeElement.setPointerCapture(event.pointerId);
  }

  protected pointerMove(event: PointerEvent): void {
    if (!this.press || !(event.buttons & 1)) return;
    if (this.press.dragging) return;
    if (
      Math.hypot(event.screenX - this.press.x, event.screenY - this.press.y) <=
      DRAG_PX
    ) {
      return;
    }
    this.press.dragging = true;
    this.dragged = true;
    this.api?.dragStart();
  }

  protected pointerUp(event?: PointerEvent): void {
    if (this.press?.dragging) this.api?.dragEnd();
    this.press = undefined;
    const host = this.host().nativeElement;
    if (event && host.hasPointerCapture(event.pointerId)) {
      host.releasePointerCapture(event.pointerId);
    }
  }

  protected click(event: MouseEvent): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    if (event.detail > 1) return;

    this.clearPoke();
    this.pokeTimer = setTimeout(() => this.companion.poke(), DBL_MS);
  }

  protected doubleClick(event: MouseEvent): void {
    event.preventDefault();
    this.clearPoke();
    this.room.expand();
  }

  private clearPoke(): void {
    if (this.pokeTimer) clearTimeout(this.pokeTimer);
    this.pokeTimer = undefined;
  }
}
