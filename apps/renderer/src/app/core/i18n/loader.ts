import { Injectable } from '@angular/core';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';

/**
 * Every catalog, keyed by the Transloco path (`es`, `projects/es`...). Static
 * dynamic imports: each one is its own lazy chunk, so it loads from file:// and
 * in jsdom without HttpClient.
 */
export const CATALOGS: Record<string, () => Promise<Translation>> = {
  es: () => import('../../../i18n/es.json').then((m) => m.default),
  en: () => import('../../../i18n/en.json').then((m) => m.default),
  'projects/es': () =>
    import('../../../i18n/projects/es.json').then((m) => m.default),
  'projects/en': () =>
    import('../../../i18n/projects/en.json').then((m) => m.default),
  'terminals/es': () =>
    import('../../../i18n/terminals/es.json').then((m) => m.default),
  'terminals/en': () =>
    import('../../../i18n/terminals/en.json').then((m) => m.default),
  'files/es': () =>
    import('../../../i18n/files/es.json').then((m) => m.default),
  'files/en': () =>
    import('../../../i18n/files/en.json').then((m) => m.default),
  'settings/es': () =>
    import('../../../i18n/settings/es.json').then((m) => m.default),
  'settings/en': () =>
    import('../../../i18n/settings/en.json').then((m) => m.default),
};

@Injectable({ providedIn: 'root' })
export class AscuaTranslocoLoader implements TranslocoLoader {
  getTranslation(path: string): Promise<Translation> {
    const load = CATALOGS[path];
    // i18n-ignore: developer error, never shown
    return load ? load() : Promise.reject(new Error(`No catalog for ${path}`));
  }
}
