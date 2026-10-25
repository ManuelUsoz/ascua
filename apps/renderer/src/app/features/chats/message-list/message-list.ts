import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import type { Message } from '@ascua/chat';
import { TranslocoPipe } from '@jsverse/transloco';
import { Spinner } from '../../../shared/spinner/spinner';
import { ChatMessage } from '../message/chat-message';

const STICK_PX = 48;

/** Scroll area that follows the stream unless the user scrolled up. */
@Component({
  selector: 'app-message-list',
  imports: [ChatMessage, Spinner, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-list', role: 'log', '(scroll)': 'onScroll()' },
  template: `
    @for (m of messages(); track m.id) {
      <app-chat-message [message]="m" [projectId]="projectId()" />
    }
    @if (responding()) {
      <app-spinner
        class="chat-list__responding"
        mode="withHorizText"
        [label]="'chats.session.responding' | transloco"
      />
    }
  `,
})
export class MessageList {
  readonly messages = input.required<readonly Message[]>();
  readonly projectId = input.required<string>();
  /** The agent is working on a reply; shows a waiting indicator at the end. */
  readonly responding = input(false);

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
