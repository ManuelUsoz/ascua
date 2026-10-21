import {
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { mountAscua, type Act, type Ascua } from '@ascua/character';

/**
 * Mounts the framework-agnostic character from `@ascua/character` into its
 * host element. The value is the SVG id prefix ('stage', 'face'); give each
 * instance on the page its own.
 */
@Directive({ selector: '[appCharacter]' })
export class Character implements OnInit, OnDestroy {
  readonly appCharacter = input.required<string>();
  /** Act to play. Leave unset when something else (the life loop) drives it. */
  readonly characterAct = input<Act>();
  readonly characterPaused = input(false);
  /** Emits once, right after the character is mounted. */
  readonly characterMount = output<Ascua>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ascua = signal<Ascua | undefined>(undefined);

  constructor() {
    effect(() => {
      const ascua = this.ascua();
      const act = this.characterAct();
      if (ascua && act) ascua.play(act);
    });
    effect(() => this.ascua()?.pause(this.characterPaused()));
  }

  ngOnInit(): void {
    const ascua = mountAscua(this.host.nativeElement, this.appCharacter());
    this.ascua.set(ascua);
    this.characterMount.emit(ascua);
  }

  ngOnDestroy(): void {
    this.ascua()?.pause(true);
  }
}
