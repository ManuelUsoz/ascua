import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { ChatErrorKind } from '@ascua/chat';
import { TranslocoPipe } from '@jsverse/transloco';
import { text } from '../../../core/i18n/text';

@Component({
  selector: 'app-error-part',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="as-form__error" role="alert">
    {{ message().key | transloco: message().params }}
  </p>`,
})
export class ErrorPart {
  readonly code = input.required<ChatErrorKind>();

  protected readonly message = computed(() =>
    text(`errors.chat.${this.code()}`, { detail: '' }),
  );
}
