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
import { Companion } from '../../core/companion/companion';
import { RoomState } from '../../core/room/room-state';
import { VoiceStore } from '../../core/voice/voice-store';
import { Character } from '../../shared/character/character';

/** Windows' default double-click interval: wait this long before poking. */
const DBL_MS = 500;
/** Movement beyond this starts an OS window drag instead of a click. */
const DRAG_PX = 4;
/** Holding still this long is push-to-talk, not a click or a drag. */
const HOLD_MS = 450;

/**
 * The avatar. In compact mode main keeps the window click-through except over
 * this square, so every gesture lands here: poke, drag, double-click to open
 * the room. Dragging is custom (see CLAUDE.md); never use an app-region.
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
  private readonly voice = inject(VoiceStore);
  private readonly host = viewChild.required<string, ElementRef<HTMLElement>>(
    'host',
    {
      read: ElementRef,
    },
  );

  private press?: {
    x: number;
    y: number;
    dragging: boolean;
    listening: boolean;
  };
  private dragged = false;
  private pokeTimer?: ReturnType<typeof setTimeout>;
  private holdTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => this.room.anchor(this.host().nativeElement));
    inject(DestroyRef).onDestroy(() => {
      this.clearPoke();
      this.clearHold();
    });
  }

  protected mounted(ascua: Ascua): void {
    this.companion.attach(live(ascua));
  }

  protected pointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.room.isCompact()) return;
    const press = {
      x: event.screenX,
      y: event.screenY,
      dragging: false,
      listening: false,
    };
    this.press = press;
    this.dragged = false;
    this.host().nativeElement.setPointerCapture(event.pointerId);
    this.clearHold();
    if (this.voice.enabled()) {
      this.holdTimer = setTimeout(() => {
        this.holdTimer = undefined;
        if (this.press !== press || press.dragging) return;
        press.listening = true;
        this.voice.pressStart();
      }, HOLD_MS);
    }
  }

  protected pointerMove(event: PointerEvent): void {
    if (!this.press || !(event.buttons & 1)) return;
    if (this.press.dragging || this.press.listening) return;
    if (
      Math.hypot(event.screenX - this.press.x, event.screenY - this.press.y) <=
      DRAG_PX
    ) {
      return;
    }
    this.clearHold();
    this.press.dragging = true;
    this.dragged = true;
    this.room.dragStart();
  }

  protected pointerUp(event?: PointerEvent): void {
    this.clearHold();
    if (this.press?.listening) {
      // The release ends the utterance; the click that follows is not a poke.
      void this.voice.pressEnd();
      this.dragged = true;
    }
    this.release(event);
  }

  protected pointerCancel(event: PointerEvent): void {
    this.clearHold();
    if (this.press?.listening) this.voice.cancelListening();
    this.release(event);
  }

  private release(event?: PointerEvent): void {
    if (this.press?.dragging) this.room.dragEnd();
    this.press = undefined;
    const host = this.host().nativeElement;
    if (event && host.hasPointerCapture(event.pointerId)) {
      host.releasePointerCapture(event.pointerId);
    }
  }

  private clearHold(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
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
