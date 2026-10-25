import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../../core/chats/chat-store';
import { errorText } from '../../../core/i18n/app-error';
import type { Text } from '../../../core/i18n/text';
import { Character } from '../../../shared/character/character';
import { Notice } from '../../../shared/notice/notice';
import { ChatComposer } from '../composer/chat-composer';

/** Empty state plus the first prompt; sending creates the session. */
@Component({
  selector: 'app-new-chat',
  imports: [TranslocoPipe, Character, ChatComposer, Notice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-new' },
  template: `
    <div class="as-empty">
      <div class="chat-new__ascua" aria-hidden="true">
        <div appCharacter="new-chat"></div>
      </div>
      <h1>{{ 'chats.newChat.title' | transloco }}</h1>
      <p>{{ 'chats.newChat.hint' | transloco }}</p>
    </div>
    @if (error(); as e) {
      <app-notice type="error" [title]="e" />
    }
    <app-chat-composer [disabled]="busy()" (submitted)="start($event)" />
  `,
})
export class NewChat {
  readonly projectId = input.required<string>();

  private readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<Text | undefined>(undefined);

  protected async start(prompt: string): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    const result = await this.store.start(this.projectId(), prompt);
    this.busy.set(false);
    if ('code' in result) {
      this.error.set(errorText(result));
      return;
    }
    await this.router.navigate([
      '/proyectos',
      this.projectId(),
      'chats',
      result.id,
    ]);
  }
}

/** Route wrapper: `chats/nuevo`. */
@Component({
  selector: 'app-new-chat-page',
  imports: [NewChat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-new-chat [projectId]="projectId()" />`,
})
export class NewChatPage {
  readonly projectId = input.required<string>();
}
