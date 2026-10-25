import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { PermissionPart } from '@ascua/chat';
import type { AscuaError } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../../core/chats/chat-store';
import { errorText } from '../../../core/i18n/app-error';
import { text } from '../../../core/i18n/text';
import { Button } from '../../../shared/button/button';
import { Icon } from '../../../shared/icon/icon';
import { Notice } from '../../../shared/notice/notice';
import { Status } from '../../../shared/status/status';
import { toolIcon } from './tool-icon';

/** Inline approval card: Allow or Deny while pending, a status once settled. */
@Component({
  selector: 'app-permission-part',
  imports: [TranslocoPipe, Button, Icon, Notice, Status],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-perm', '[attr.data-state]': 'part().state' },
  template: `
    <div class="chat-perm__head">
      <app-icon [name]="icon()" />
      <strong>{{ 'chats.permission.title' | transloco }}</strong>
    </div>
    <p class="chat-perm__title">{{ part().request.title }}</p>
    @if (part().request.detail; as detail) {
      <code class="chat-perm__detail">{{ detail }}</code>
    }
    @if (part().state === 'pending') {
      <div class="chat-perm__actions">
        <button
          appButton
          type="button"
          variant="primary"
          size="s"
          [disabled]="busy()"
          (clicked)="resolve(true)"
        >
          {{ 'chats.permission.allow' | transloco }}
        </button>
        <button
          appButton
          type="button"
          variant="quiet"
          size="s"
          [disabled]="busy()"
          (clicked)="resolve(false)"
        >
          {{ 'chats.permission.deny' | transloco }}
        </button>
      </div>
    } @else {
      <app-status [state]="settled().state" [label]="settled().label" />
    }
    @if (error(); as e) {
      <app-notice type="error" [title]="e" />
    }
  `,
})
export class PermissionCard {
  readonly projectId = input.required<string>();
  readonly sessionId = input.required<string>();
  readonly part = input.required<PermissionPart>();

  private readonly store = inject(ChatStore);
  protected readonly busy = signal(false);
  protected readonly error = signal<ReturnType<typeof errorText> | undefined>(
    undefined,
  );

  protected readonly icon = computed(() => toolIcon(this.part().request.tool));
  protected readonly settled = computed(() =>
    this.part().state === 'allowed'
      ? ({
          state: 'running',
          label: text('chats.permission.allowed'),
        } as const)
      : ({
          state: 'crashed',
          label: text('chats.permission.denied'),
        } as const),
  );

  protected async resolve(allow: boolean): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(undefined);
    const failure: AscuaError | undefined = await this.store.resolvePermission(
      this.projectId(),
      this.sessionId(),
      this.part().request.requestId,
      allow,
    );
    if (failure) this.error.set(errorText(failure));
    this.busy.set(false);
  }
}
