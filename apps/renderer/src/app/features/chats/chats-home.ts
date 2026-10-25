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
import { ChatStore } from '../../core/chats/chat-store';
import { NewChat } from './new-chat/new-chat';
import { ProviderOnboarding } from './provider-onboarding/provider-onboarding';

/** Entry of the Chats tab: onboarding, new chat, or the latest session. */
@Component({
  selector: 'app-chats-home',
  imports: [ProviderOnboarding, NewChat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ready()) {
      @if (!store.selectedProvider()) {
        <app-provider-onboarding [projectId]="projectId()" />
      } @else if (!latest()) {
        <app-new-chat [projectId]="projectId()" />
      }
    }
  `,
})
export class ChatsHome {
  readonly projectId = input.required<string>();

  protected readonly store = inject(ChatStore);
  private readonly router = inject(Router);
  protected readonly ready = signal(false);
  protected readonly latest = computed(() =>
    this.store
      .sessions(this.projectId())
      .reduce<
        ReturnType<ChatStore['sessions']>[number] | undefined
      >((best, s) => (!best || s.updatedAt > best.updatedAt ? s : best), undefined),
  );

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => {
        this.ready.set(false);
        void Promise.all([
          this.store.loadProviders(),
          this.store.load(id),
        ]).then(() => this.ready.set(true));
      });
    });
    effect(() => {
      const latest = this.latest();
      if (!this.ready() || !this.store.selectedProvider() || !latest) return;
      untracked(() => {
        void this.router.navigate(
          ['/proyectos', this.projectId(), 'chats', latest.id],
          { replaceUrl: true },
        );
      });
    });
  }
}
