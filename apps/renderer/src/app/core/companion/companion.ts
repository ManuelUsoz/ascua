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

  attach(life: Life): void {
    this.life = life;
    if (this.pending) life.need(this.pending);
    this.pending = undefined;
  }

  need(act: Need): void {
    if (this.life) this.life.need(act);
    else this.pending = act;
  }

  celebrate(): void {
    this.pending = undefined;
    this.life?.celebrate();
  }

  release(): void {
    this.pending = undefined;
    this.life?.release();
  }

  poke(): void {
    this.life?.poke();
  }
}
