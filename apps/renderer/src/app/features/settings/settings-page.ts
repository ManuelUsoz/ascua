import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  LANGUAGES,
  VOICE_STYLES,
  type Language,
  type VoiceSettings,
} from '@ascua/ipc';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorText } from '../../core/i18n/app-error';
import { SettingsStore } from '../../core/settings/settings-store';
import type { LoadProgress } from '../../core/voice/ports';
import { VoiceStore } from '../../core/voice/voice-store';

/** Settings screen: one panel per setting. */
@Component({
  selector: 'app-settings-page',
  imports: [TranslocoPipe],
  templateUrl: './settings-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  protected readonly settings = inject(SettingsStore);
  protected readonly voice = inject(VoiceStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly languages = LANGUAGES;
  protected readonly styles = VOICE_STYLES;

  protected readonly failed = signal(false);
  protected readonly preparing = signal(false);
  protected readonly voiceFailure = computed(() => {
    const error = this.voice.error();
    return error ? errorText(error) : undefined;
  });

  protected async choose(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const language = LANGUAGES.find((l) => l === select.value);
    if (!language) return;
    this.failed.set(false);
    try {
      await this.settings.setLanguage(language satisfies Language);
    } catch {
      select.value = this.settings.language();
      this.failed.set(true);
    }
  }

  protected toggle(key: 'enabled' | 'autoSpeak', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const patch: Partial<VoiceSettings> =
      key === 'enabled' ? { enabled: checked } : { autoSpeak: checked };
    void this.settings.setVoice(patch);
  }

  protected chooseStyle(event: Event): void {
    const style = VOICE_STYLES.find(
      (s) => s === (event.target as HTMLSelectElement).value,
    );
    if (style) void this.settings.setVoice({ style });
  }

  protected test(): void {
    this.voice.preview(this.transloco.translate('settings.voice.sample'));
  }

  protected async prepare(): Promise<void> {
    this.preparing.set(true);
    try {
      await this.voice.prepare();
    } finally {
      this.preparing.set(false);
    }
  }

  protected clear(): void {
    void this.voice.clearModels();
  }

  protected percent(p: LoadProgress): number {
    return p.total > 0
      ? Math.min(100, Math.round((p.loaded / p.total) * 100))
      : 0;
  }
}
