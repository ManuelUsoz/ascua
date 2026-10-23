import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { LANGUAGES, type Language } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { SettingsStore } from '../../core/settings/settings-store';

/** Settings screen: one panel per setting. */
@Component({
  selector: 'app-settings-page',
  imports: [TranslocoPipe],
  templateUrl: './settings-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  protected readonly settings = inject(SettingsStore);
  protected readonly languages = LANGUAGES;

  protected readonly failed = signal(false);

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
}
