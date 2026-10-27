import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** Determinate progress bar; styled by `.as-progress` in `shared-ui.css`. */
@Component({
  selector: 'app-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'as-progress',
    role: 'progressbar',
    'aria-valuemin': '0',
    '[attr.aria-valuemax]': 'max()',
    '[attr.aria-valuenow]': 'value()',
    '[attr.aria-label]': 'label() ?? null',
  },
  template: `<span
    class="as-progress__fill"
    [attr.data-complete]="complete() ? '' : null"
    [style.transform]="'scaleX(' + ratio() + ')'"
  ></span>`,
})
export class ProgressBar {
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly label = input<string>();

  protected readonly ratio = computed(() =>
    this.max() > 0 ? Math.min(1, Math.max(0, this.value() / this.max())) : 0,
  );
  protected readonly complete = computed(
    () => this.max() > 0 && this.value() >= this.max(),
  );
}
