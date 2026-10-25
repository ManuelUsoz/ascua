import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Plain text only: never innerHTML. */
@Component({
  selector: 'app-text-part',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-text' },
  template: `{{ text() }}`,
})
export class TextPart {
  readonly text = input.required<string>();
}
