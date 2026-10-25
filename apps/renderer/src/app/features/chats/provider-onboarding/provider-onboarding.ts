import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { AgentProviderId } from '@ascua/chat';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../../core/chats/chat-store';
import { TerminalSessions } from '../../../core/terminals/terminal-sessions';
import { errorText } from '../../../core/i18n/app-error';
import { text, type Text } from '../../../core/i18n/text';
import { Button } from '../../../shared/button/button';
import { Notice } from '../../../shared/notice/notice';
import { Spinner } from '../../../shared/spinner/spinner';
import { Status } from '../../../shared/status/status';

/** Pick a provider, check its login, sign in if needed, then select it. */
@Component({
  selector: 'app-provider-onboarding',
  imports: [TranslocoPipe, Button, Notice, Spinner, Status],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-onboarding' },
  templateUrl: './provider-onboarding.html',
})
export class ProviderOnboarding {
  readonly projectId = input.required<string>();

  protected readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  private readonly terminals = inject(TerminalSessions);
  protected readonly chosen = signal<AgentProviderId | undefined>(undefined);
  protected readonly error = signal<Text | undefined>(undefined);

  /** The auth of the chosen provider; undefined while it is being checked. */
  protected readonly auth = computed(() => {
    const a = this.store.auth();
    return a && a.provider === this.chosen() ? a : undefined;
  });
  protected readonly loggedInLabel = computed<Text>(() => {
    const a = this.auth();
    const email = a?.state === 'loggedIn' ? a.account?.email : undefined;
    return email
      ? text('chats.onboarding.loggedInAs', { email })
      : text('chats.onboarding.loggedIn');
  });
  protected readonly loggedOutLabel = text('chats.onboarding.loggedOut');
  protected readonly unavailableError = computed<Text | undefined>(() => {
    const a = this.auth();
    return a?.state === 'unavailable'
      ? text(`errors.chat.${a.error}`, { detail: '' })
      : undefined;
  });

  protected pick(id: AgentProviderId): void {
    this.chosen.set(id);
    this.error.set(undefined);
    void this.store.checkAuth(id);
  }

  protected checkAgain(): void {
    const id = this.chosen();
    if (id) void this.store.checkAuth(id);
  }

  protected async signIn(): Promise<void> {
    const id = this.chosen();
    if (!id) return;
    this.error.set(undefined);
    const result = await this.store.login(this.projectId(), id);
    if ('code' in result) {
      this.error.set(errorText(result));
      return;
    }
    this.terminals.adopt(result);
    await this.router.navigate(['/proyectos', this.projectId(), 'terminales']);
  }

  protected async use(): Promise<void> {
    const id = this.chosen();
    if (!id) return;
    const failure = await this.store.select(id);
    if (failure) this.error.set(errorText(failure));
  }
}
