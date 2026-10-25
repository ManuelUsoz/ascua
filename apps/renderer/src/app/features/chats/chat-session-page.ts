import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ChatStore } from '../../core/chats/chat-store';
import { errorText } from '../../core/i18n/app-error';
import { type Text } from '../../core/i18n/text';
import { Notice } from '../../shared/notice/notice';
import { ChatComposer } from './composer/chat-composer';
import { MessageList } from './message-list/message-list';

const NO_MESSAGES: readonly never[] = [];

/** One chat: transcript and composer. */
@Component({
  selector: 'app-chat-session-page',
  imports: [Notice, ChatComposer, MessageList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-session' },
  templateUrl: './chat-session-page.html',
})
export class ChatSessionPage {
  readonly projectId = input.required<string>();
  readonly sessionId = input.required<string>();

  protected readonly store = inject(ChatStore);
  protected readonly error = signal<Text | undefined>(undefined);

  protected readonly messages = computed(
    () => this.store.transcript(this.sessionId()) ?? NO_MESSAGES,
  );
  protected readonly loaded = computed(
    () => this.store.transcript(this.sessionId()) !== undefined,
  );
  protected readonly status = computed(() =>
    this.store.status(this.sessionId()),
  );
  protected readonly running = computed(
    () => this.status() === 'running' || this.status() === 'awaitingPermission',
  );

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const sessionId = this.sessionId();
      untracked(() => {
        this.error.set(undefined);
        void this.store.load(projectId);
        void this.store.loadTranscript(projectId, sessionId);
      });
    });
  }

  protected async send(prompt: string): Promise<void> {
    this.error.set(undefined);
    const failure = await this.store.send(
      this.projectId(),
      this.sessionId(),
      prompt,
    );
    if (failure) this.error.set(errorText(failure));
  }

  protected stop(): void {
    void this.store.abort(this.projectId(), this.sessionId());
  }
}
