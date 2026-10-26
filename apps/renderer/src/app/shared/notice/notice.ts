import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Text } from '../../core/i18n/text';

export type NoticeType = 'error' | 'warning' | 'info';

@Component({
  selector: 'app-notice',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'as-notice',
    '[attr.data-tone]': 'tone()',
    '[attr.role]': "type() === 'info' ? 'status' : 'alert'",
  },
  template: `
    <span class="as-notice__chip">
      <svg class="as-ico as-ico--l" viewBox="0 0 24 24" aria-hidden="true">
        @switch (type()) {
          @case ('info') {
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          }
          @default {
            <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />
          }
        }
      </svg>
    </span>
    <div class="as-notice__main">
      <div class="as-notice__head">
        <div class="as-notice__title">
          {{ title().key | transloco: title().params }}
        </div>
        <div class="as-notice__status">
          <ng-content select="[noticeStatus]" />
        </div>
      </div>
      <div class="as-notice__body"><ng-content /></div>
      <div class="as-notice__actions">
        <ng-content select="[noticeActions]" />
      </div>
    </div>
    @if (dismissible()) {
      <button
        type="button"
        class="as-btn as-btn--ghost as-notice__close"
        [attr.aria-label]="'notice.dismiss' | transloco"
        (click)="dismissed.emit()"
      >
        <svg class="as-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    }
  `,
})
export class Notice {
  readonly type = input.required<NoticeType>();
  readonly title = input.required<Text>();
  readonly dismissible = input(false);
  readonly dismissed = output<void>();

  protected readonly tone = computed(() => {
    switch (this.type()) {
      case 'error':
        return 'alert';
      case 'warning':
        return 'warn';
      default:
        return 'ask';
    }
  });
}
