import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { Message } from '@ascua/chat';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorPart } from '../parts/error-part';
import { PermissionCard } from '../parts/permission-part';
import { TextPart } from '../parts/text-part';
import { ThinkingPart } from '../parts/thinking-part';
import { ToolPart } from '../parts/tool-part';

/** One bubble; each part kind has its own renderer. */
@Component({
  selector: 'app-chat-message',
  imports: [
    TranslocoPipe,
    TextPart,
    ThinkingPart,
    ToolPart,
    PermissionCard,
    ErrorPart,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-msg', '[attr.data-role]': 'message().role' },
  template: `
    @for (part of message().parts; track $index) {
      @switch (part.kind) {
        @case ('text') {
          <app-text-part [text]="part.text" />
        }
        @case ('thinking') {
          <app-thinking-part [text]="part.text" />
        }
        @case ('toolUse') {
          <app-tool-part
            [tool]="part.tool"
            [title]="part.title"
            [status]="part.status"
          />
        }
        @case ('toolResult') {
          @if (part.summary) {
            <p class="chat-tool-result" [attr.data-error]="part.isError">
              {{ part.summary }}
            </p>
          }
        }
        @case ('permission') {
          <app-permission-part
            [projectId]="projectId()"
            [sessionId]="message().sessionId"
            [part]="part"
          />
        }
        @case ('error') {
          <app-error-part [code]="part.code" />
        }
      }
    }
    @if (footer(); as f) {
      <footer class="chat-msg__usage">
        <span>{{ 'chats.usage.tokens' | transloco: { count: f.tokens } }}</span>
        @if (f.cost; as cost) {
          <span>{{ 'chats.usage.cost' | transloco: { cost: cost } }}</span>
        }
      </footer>
    }
  `,
})
export class ChatMessage {
  readonly message = input.required<Message>();
  readonly projectId = input.required<string>();

  /** Tokens and cost of a completed assistant turn. */
  protected readonly footer = computed(() => {
    const m = this.message();
    if (m.role !== 'assistant' || !m.usage || !m.stop) return undefined;
    return {
      tokens: m.usage.inputTokens + m.usage.outputTokens,
      cost: m.usage.costUsd ? m.usage.costUsd.toFixed(4) : undefined,
    };
  });
}
