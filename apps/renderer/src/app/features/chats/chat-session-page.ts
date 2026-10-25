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
import type { ChatSessionPatch } from '@ascua/ipc';
import {
  CLEAR_COMMAND,
  DEFAULT_PERMISSION_MODE,
  parseCommand,
  type ChatModeId,
  type PermissionMode,
} from '@ascua/chat';
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
  protected readonly session = computed(() =>
    this.store.session(this.projectId(), this.sessionId()),
  );
  protected readonly commands = computed(() =>
    this.store.commands(this.projectId()),
  );
  protected readonly permissionMode = computed<PermissionMode>(
    () => this.session()?.permissionMode ?? DEFAULT_PERMISSION_MODE,
  );
  protected readonly model = computed(() => this.session()?.model);
  protected readonly effort = computed(() => this.session()?.effort);
  protected readonly catalog = computed(() =>
    this.store.models(this.projectId()),
  );
  protected readonly mode = computed<ChatModeId>(
    () => this.session()?.mode ?? 'chat',
  );

  constructor() {
    effect(() => {
      const projectId = this.projectId();
      const sessionId = this.sessionId();
      untracked(() => {
        this.error.set(undefined);
        void this.store.load(projectId);
        void this.store.loadTranscript(projectId, sessionId);
        void this.store.loadCommands(projectId, sessionId);
        void this.store.loadModels(projectId);
      });
    });
  }

  protected async send(prompt: string): Promise<void> {
    this.error.set(undefined);
    const failure =
      parseCommand(prompt)?.name === CLEAR_COMMAND.name
        ? await this.store.clear(this.projectId(), this.sessionId())
        : await this.store.send(this.projectId(), this.sessionId(), prompt);
    if (failure) this.error.set(errorText(failure));
  }

  protected async changeRuntime(patch: ChatSessionPatch): Promise<void> {
    await this.update(patch);
  }

  protected async exitMode(): Promise<void> {
    await this.update({ mode: 'chat' });
  }

  protected stop(): void {
    void this.store.abort(this.projectId(), this.sessionId());
  }

  private async update(patch: ChatSessionPatch): Promise<void> {
    this.error.set(undefined);
    const failure = await this.store.update(
      this.projectId(),
      this.sessionId(),
      patch,
    );
    if (failure) this.error.set(errorText(failure));
  }
}
