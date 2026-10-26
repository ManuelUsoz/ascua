import { Injectable } from '@angular/core';
import type { Life, Need } from '@ascua/character';

/**
 * What the avatar is doing. The avatar attaches its life loop once its
 * character is mounted; a need raised before that is replayed on attach.
 */
@Injectable({ providedIn: 'root' })
export class Companion {
  private life?: Life;
  private pending?: Need;
  private needing: Need | null = null;
  private speaking: 'listening' | 'speaking' | null = null;
  private working: 'think' | 'read' | null = null;
  /** The act last handed to the life loop, null when it lives freely. */
  private shown: Need | null = null;

  attach(life: Life): void {
    this.life = life;
    if (this.pending) life.need(this.pending);
    this.pending = undefined;
  }

  need(act: Need): void {
    this.needing = act;
    this.shown = null;
    this.apply();
  }

  /**
   * The assistant is working. A permission need or a voice state takes
   * precedence: the act is only recorded and resumed when they end.
   */
  work(act: 'think' | 'read' | null): void {
    this.working = act;
    this.apply();
  }

  /** The user is talking to Ascua, or Ascua is talking back. */
  voice(state: 'listening' | 'speaking' | null): void {
    this.speaking = state;
    this.apply();
  }

  celebrate(): void {
    this.pending = undefined;
    this.needing = null;
    this.shown = null;
    this.life?.celebrate();
  }

  release(): void {
    this.needing = null;
    this.apply();
  }

  poke(): void {
    this.life?.poke();
  }

  /** Precedence: permission need > voice > work > life. */
  private apply(): void {
    const voice =
      this.speaking === 'listening'
        ? 'listen'
        : this.speaking === 'speaking'
          ? 'talk'
          : null;
    const act = this.needing ?? voice ?? this.working;
    if (act === this.shown) return;
    this.shown = act;
    if (act) {
      if (this.life) this.life.need(act);
      else this.pending = act;
      return;
    }
    this.pending = undefined;
    this.life?.release();
  }
}
