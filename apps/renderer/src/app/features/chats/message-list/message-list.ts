import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import type { Message } from '@ascua/chat';
import { text, type Text } from '../../../core/i18n/text';
import { WorkingIndicator } from '../../../shared/working-indicator/working-indicator';
import { ChatMessage } from '../message/chat-message';

const STICK_PX = 48;

/** Scroll area that follows the stream unless the user scrolled up. */
@Component({
  selector: 'app-message-list',
  imports: [ChatMessage, WorkingIndicator],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-list', role: 'log', '(scroll)': 'onScroll()' },
  template: `
    @for (m of messages(); track m.id) {
      <app-chat-message [message]="m" [projectId]="projectId()" />
    }
    @if (responding()) {
      <app-working-indicator
        class="chat-list__responding"
        [label]="workingLabel()"
      />
    }
  `,
})
export class MessageList {
  readonly messages = input.required<readonly Message[]>();
  readonly projectId = input.required<string>();
  /** The agent is working on a reply; shows a waiting indicator at the end. */
  readonly responding = input(false);

  /** "Working" plus the tool currently running, when there is one. */
  protected readonly workingLabel = computed<Text>(() => {
    const list = this.messages();
    const last = list[list.length - 1];
    const active = (last?.parts ?? []).filter(
      (p) => p.kind === 'toolUse' && p.status === 'running',
    );
    const running = active[active.length - 1];
    if (running?.kind !== 'toolUse') return text('chats.working');
    const at = running.title.indexOf(':');
    const tool = at < 0 ? running.title : running.title.slice(0, at).trim();
    const target =
      running.path ?? (at < 0 ? '' : running.title.slice(at + 1).trim());
    return text('chats.workingOn', { tool, target });
  });

  private readonly el =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private stick = true;

  constructor() {
    afterRenderEffect(() => {
      this.messages();
      this.responding();
      if (this.stick) this.el.scrollTop = this.el.scrollHeight;
    });
  }

  protected onScroll(): void {
    const { scrollHeight, scrollTop, clientHeight } = this.el;
    this.stick = scrollHeight - scrollTop - clientHeight < STICK_PX;
  }
}
