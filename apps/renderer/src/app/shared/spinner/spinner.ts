import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type SpinnerMode = 'only' | 'withHorizText' | 'withTitleAndSubt';
export type SpinnerSize = 12 | 16 | 24 | 40;

@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    '[attr.aria-label]': "mode() === 'only' ? (label() ?? null) : null",
    '[class]': "'as-spinner-block as-spinner-block--' + mode()",
  },
  template: `
    <span
      class="as-spinner"
      aria-hidden="true"
      [class.as-spinner--s]="effectiveSize() === 12"
      [class.as-spinner--l]="effectiveSize() === 24"
      [class.as-spinner--xl]="effectiveSize() === 40"
      [class.as-spinner--violeta]="tone() === 'violeta'"
    ></span>
    @switch (mode()) {
      @case ('withHorizText') {
        <span class="as-spinner-block__text">{{ label() }}</span>
      }
      @case ('withTitleAndSubt') {
        <strong class="as-spinner-block__title">{{ title() }}</strong>
        <span class="as-spinner-block__sub">{{ subtitle() }}</span>
      }
    }
  `,
})
export class Spinner {
  readonly mode = input<SpinnerMode>('only');
  readonly size = input<SpinnerSize>(16);
  readonly tone = input<'oro' | 'violeta'>('oro');
  readonly label = input<string>();
  readonly title = input<string>();
  readonly subtitle = input<string>();

  protected readonly effectiveSize = computed<SpinnerSize>(() => {
    switch (this.mode()) {
      case 'withHorizText':
        return 12;
      case 'withTitleAndSubt':
        return this.size() === 12 ? 16 : this.size();
      default:
        return this.size();
    }
  });
}
