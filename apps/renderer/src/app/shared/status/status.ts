import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Text } from '../../core/i18n/text';

export type StatusState =
  | 'working'
  | 'running'
  | 'waiting'
  | 'stuck'
  | 'crashed'
  | 'stopped';

const TONE: Record<StatusState, string> = {
  working: 'live',
  running: 'ok',
  waiting: 'ask',
  stuck: 'warn',
  crashed: 'alert',
  stopped: 'idle',
};

@Component({
  selector: 'app-status',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="as-state" [attr.data-tone]="tone()"
    ><span class="as-dot"></span
    >{{ shown().key | transloco: shown().params }}</span
  >`,
})
export class Status {
  readonly state = input.required<StatusState>();
  /** Optional override for the visible text, e.g. an error detail. */
  readonly label = input<Text>();

  protected readonly tone = computed(() => TONE[this.state()]);
  protected readonly shown = computed<Text>(
    () => this.label() ?? { key: `status.${this.state()}` }, // i18n-ignore: catalog key
  );
}
