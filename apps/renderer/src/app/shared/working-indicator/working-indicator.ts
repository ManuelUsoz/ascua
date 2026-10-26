import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Text } from '../../core/i18n/text';
import { Spinner } from '../spinner/spinner';

@Component({
  selector: 'app-working-indicator',
  imports: [Spinner, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'as-working',
    role: 'status',
    'aria-live': 'polite',
  },
  template: `
    <app-spinner [size]="12" tone="violeta" aria-hidden="true" />
    @for (l of [label()]; track l.key) {
      <span class="as-working__label">{{ l.key | transloco: l.params }}</span>
    }
  `,
})
export class WorkingIndicator {
  readonly label = input.required<Text>();
}
