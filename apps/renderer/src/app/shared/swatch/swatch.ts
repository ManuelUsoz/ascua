import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-swatch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'as-swatch',
    'aria-hidden': 'true',
    '[class.as-swatch--pulse]': 'pulse()',
    '[style.--swatch]': 'color()',
  },
  template: '',
})
export class Swatch {
  readonly color = input.required<string>();
  readonly pulse = input(false);
}
