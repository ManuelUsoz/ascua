import { effect, inject, Injectable, Injector, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { UI_LABEL_KEYS, type NavigateTarget, type UiLabels } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { resolveLabels } from '../i18n/labels';
import { targetFor } from '../navigation/assistant-navigation';
import { SettingsStore } from '../settings/settings-store';

/**
 * Tells main what the UI looks like: the real labels in the user's language and
 * the current route. Main uses it for `ui_guide` and `window_state`. A collapsed
 * room still reports the last route; `window_state.open` tells the two apart.
 */
@Injectable({ providedIn: 'root' })
export class AssistantContext {
  private readonly api = inject(ASCUA_API);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsStore);
  private readonly injector = inject(Injector);
  private readonly labels = signal<UiLabels>({});
  private readonly route = signal<NavigateTarget | undefined>(undefined);
  private started = false;

  /** The live labels, for consumers such as the voice vocabulary. */
  readonly uiLabels = this.labels.asReadonly();

  /** Idempotent. */
  start(): void {
    const api = this.api;
    if (this.started || !api) return;
    this.started = true;

    this.route.set(targetFor(this.router.url));
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.route.set(targetFor(event.urlAfterRedirects));
      }
    });

    effect(
      () => {
        const language = this.settings.language();
        void resolveLabels(UI_LABEL_KEYS, language).then(
          (labels) => {
            if (language === this.settings.language()) this.labels.set(labels);
          },
          () => undefined,
        );
      },
      { injector: this.injector },
    );

    effect(
      () => {
        api.assistantContext({
          labels: this.labels(),
          route: this.route(),
        });
      },
      { injector: this.injector },
    );
  }
}
