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
import { Router } from '@angular/router';
import {
  CLEAR_COMMAND,
  DEFAULT_PERMISSION_MODE,
  type PermissionMode,
} from '@ascua/chat';
import type { ChatSessionPatch, ChatStartOptions } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../../core/chats/chat-store';
import { SettingsStore } from '../../../core/settings/settings-store';
import { errorText } from '../../../core/i18n/app-error';
import type { Text } from '../../../core/i18n/text';
import { Character } from '../../../shared/character/character';
import { Notice } from '../../../shared/notice/notice';
import { ChatComposer } from '../composer/chat-composer';
import { ProviderOnboarding } from '../provider-onboarding/provider-onboarding';

/** Empty state plus the first prompt; sending creates the session. */
@Component({
  selector: 'app-new-chat',
  imports: [TranslocoPipe, Character, ChatComposer, Notice, ProviderOnboarding],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-new' },
  template: `
    @if (ready()) {
      @if (!store.selectedProvider()) {
        <app-provider-onboarding [projectId]="projectId()" />
      } @else {
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
        <app-chat-composer
          [disabled]="busy()"
          [commands]="commands()"
          [catalog]="catalog()"
          [loading]="store.capabilitiesLoading(projectId())"
          [permissionMode]="permissionMode()"
          [model]="model()"
          [effort]="effort()"
          (submitted)="start($event)"
          (runtimeChanged)="change($event)"
        />
      }
    }
  `,
})
export class NewChat {
  readonly projectId = input.required<string>();

  protected readonly store = inject(ChatStore);
  private readonly settings = inject(SettingsStore);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly ready = signal(false);
  protected readonly error = signal<Text | undefined>(undefined);
  /** User picks made in this form, over the remembered provider defaults. */
  private readonly picked = signal<ChatSessionPatch>({});
  private readonly defaults = computed(() => {
    const provider = this.store.selectedProvider();
    return (
      (provider && this.settings.settings().chatDefaults?.[provider]) || {}
    );
  });
  /** Applied to the session this first prompt creates. */
  protected readonly permissionMode = computed<PermissionMode>(
    () =>
      this.picked().permissionMode ??
      this.defaults().permissionMode ??
      DEFAULT_PERMISSION_MODE,
  );
  protected readonly model = computed(() => {
    const p = this.picked();
    return 'model' in p ? (p.model ?? undefined) : this.defaults().model;
  });
  protected readonly effort = computed(() => {
    const p = this.picked();
    return 'effort' in p ? (p.effort ?? undefined) : this.defaults().effort;
  });
  protected readonly catalog = computed(() =>
    this.store.models(this.projectId()),
  );
  /** No session yet, so `/clear` has nothing to clear. */
  protected readonly commands = computed(() =>
    this.store
      .commands(this.projectId())
      .filter((c) => c.name !== CLEAR_COMMAND.name),
  );

  constructor() {
    void this.store.loadProviders().then(() => this.ready.set(true));
    effect(() => {
      const projectId = this.projectId();
      untracked(() => {
        void this.store.loadCommands(projectId);
        void this.store.loadModels(projectId);
      });
    });
  }

  protected change(patch: ChatSessionPatch): void {
    this.picked.update((p) => ({ ...p, ...patch }));
  }

  protected async start(prompt: string): Promise<void> {
    this.busy.set(true);
    this.error.set(undefined);
    const options: ChatStartOptions = {
      permissionMode: this.permissionMode(),
      ...(this.model() && { model: this.model() }),
      ...(this.effort() && { effort: this.effort() }),
    };
    const result = await this.store.start(this.projectId(), prompt, options);
    this.busy.set(false);
    if ('code' in result) {
      this.error.set(errorText(result));
      return;
    }
    const provider = this.store.selectedProvider();
    if (provider) await this.settings.setChatDefaults(provider, options);
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
