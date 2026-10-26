import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import {
  DEFAULT_VOICE_SETTINGS,
  LANGUAGES,
  type Language,
  type Settings,
  type VoiceSettings,
} from '@ascua/ipc';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ASCUA_API } from '../bridge/ascua-api';

/** First browser language that is es or en; Spanish otherwise. */
function browserLanguage(): Language {
  for (const tag of navigator.languages ?? []) {
    const base = tag.toLowerCase().split('-')[0];
    const found = LANGUAGES.find((language) => language === base);
    if (found) return found;
  }
  return 'es';
}

/**
 * User settings. Main owns them (`settings.json`); this mirrors them and keeps
 * Transloco on the chosen language. In a browser preview they are local only.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly api = inject(ASCUA_API);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly state = signal<Settings>({
    language: 'es',
    voice: DEFAULT_VOICE_SETTINGS,
  });

  readonly settings = this.state.asReadonly();
  readonly language = computed(() => this.state().language);
  readonly voice = computed(() => this.state().voice);

  /** Runs before bootstrap ends so the first paint is in the right language. */
  async init(): Promise<void> {
    const api = this.api;
    const initial = api
      ? await api.getSettings().catch(() => undefined)
      : undefined;
    await this.apply(
      initial ?? { language: browserLanguage(), voice: DEFAULT_VOICE_SETTINGS },
    );
    if (api) {
      this.destroyRef.onDestroy(
        api.onSettingsChanged((settings) => void this.apply(settings)),
      );
    }
  }

  async setLanguage(language: Language): Promise<void> {
    const api = this.api;
    await this.apply(
      api
        ? await api.updateSettings({ language })
        : { ...this.state(), language },
    );
  }

  async setVoice(patch: Partial<VoiceSettings>): Promise<void> {
    const api = this.api;
    await this.apply(
      api
        ? await api.updateSettings({ voice: patch })
        : {
            ...this.state(),
            voice: { ...this.state().voice, ...patch },
          },
    );
  }

  private async apply(settings: Settings): Promise<void> {
    this.state.set(settings);
    document.documentElement.lang = settings.language;
    this.transloco.setActiveLang(settings.language);
    await firstValueFrom(this.transloco.load(settings.language));
  }
}
