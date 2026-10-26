import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { groupParts, type Message } from '@ascua/chat';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorPart } from '../parts/error-part';
import { MarkdownPart } from '../parts/markdown-part';
import { PermissionCard } from '../parts/permission-part';
import { TextPart } from '../parts/text-part';
import { ThinkingPart } from '../parts/thinking-part';
import { ToolGroupView } from '../parts/tool-group';

/** One bubble; each part kind has its own renderer. */
@Component({
  selector: 'app-chat-message',
  imports: [
    TranslocoPipe,
    TextPart,
    MarkdownPart,
    ThinkingPart,
    ToolGroupView,
    PermissionCard,
    ErrorPart,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-msg', '[attr.data-role]': 'message().role' },
  template: `
    @for (part of segments(); track $index) {
      @switch (part.kind) {
        @case ('toolGroup') {
          <app-tool-group [group]="part" />
        }
        @case ('text') {
          @if (message().role === 'assistant') {
            <app-markdown-part [text]="part.text" />
          } @else {
            <app-text-part [text]="part.text" />
          }
        }
        @case ('thinking') {
          <app-thinking-part [text]="part.text" />
        }
        @case ('toolResult') {
          @if (part.summary && part.isError) {
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

  protected readonly segments = computed(() =>
    groupParts(this.message().parts),
  );

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
