import {
  EnvironmentProviders,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import type { ResolveFn } from '@angular/router';
import { LANGUAGES } from '@ascua/ipc';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { SettingsStore } from '../settings/settings-store';
import { AscuaTranslocoLoader } from './loader';

/** Transloco with the static loader; the language comes from main's settings. */
export function provideAscuaI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...LANGUAGES],
        defaultLang: 'es',
        fallbackLang: 'es',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { useFallbackTranslation: true },
      },
      loader: AscuaTranslocoLoader,
    }),
    provideAppInitializer(() => inject(SettingsStore).init()),
  ]);
}

/**
 * Route resolver that waits for a scope's catalog in the active language, so a
 * lazy page never renders empty strings for a frame.
 */
export function scopeResolver(scope: string): ResolveFn<void> {
  return async () => {
    const transloco = inject(TranslocoService);
    await firstValueFrom(
      transloco.load(`${scope}/${transloco.getActiveLang()}`),
    );
  };
}
