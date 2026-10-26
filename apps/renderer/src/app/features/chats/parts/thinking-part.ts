import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-thinking-part',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="chat-thinking">
      <summary>{{ 'chats.part.thinking' | transloco }}</summary>
      <p>{{ text() }}</p>
    </details>
  `,
})
export class ThinkingPart {
  readonly text = input.required<string>();
}
