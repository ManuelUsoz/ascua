import { inject, Injectable } from '@angular/core';
import { RoomState } from '../room/room-state';
import { VoiceStore } from './voice-store';

/** Ctrl+Space, pressed fresh (not auto-repeat), no Alt/Meta. */
export function isPushToTalkDown(e: KeyboardEvent): boolean {
  return (
    e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'Space' && !e.repeat
  );
}

/**
 * Hold Ctrl+Space in the open room to talk. Listens in the capture phase so
 * xterm and CodeMirror never see the chord.
 */
@Injectable({ providedIn: 'root' })
export class PushToTalkKey {
  private readonly room = inject(RoomState);
  private readonly voice = inject(VoiceStore);
  private started = false;
  private holding = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('keydown', (e) => this.down(e), true);
    window.addEventListener('keyup', (e) => this.up(e), true);
    window.addEventListener('blur', () => this.blur());
  }

  private active(): boolean {
    return this.room.open() && this.voice.enabled();
  }

  private down(e: KeyboardEvent): void {
    if (this.holding && e.ctrlKey && e.code === 'Space') {
      // swallow auto-repeat while held
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!this.active() || !isPushToTalkDown(e)) return;
    e.preventDefault();
    e.stopPropagation();
    this.holding = true;
    this.voice.pressStart();
  }

  private up(e: KeyboardEvent): void {
    if (!this.holding) return;
    if (e.code !== 'Space' && e.key !== 'Control') return;
    e.preventDefault();
    e.stopPropagation();
    this.holding = false;
    void this.voice.pressEnd();
  }

  private blur(): void {
    if (!this.holding) return;
    this.holding = false;
    this.voice.cancelListening();
  }
}
