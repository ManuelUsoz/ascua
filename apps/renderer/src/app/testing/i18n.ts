import type { Language } from '@ascua/ipc';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../i18n/en.json';
import es from '../../i18n/es.json';
import projectsEn from '../../i18n/projects/en.json';
import projectsEs from '../../i18n/projects/es.json';
import terminalsEn from '../../i18n/terminals/en.json';
import terminalsEs from '../../i18n/terminals/es.json';
import filesEn from '../../i18n/files/en.json';
import filesEs from '../../i18n/files/es.json';
import settingsEn from '../../i18n/settings/en.json';
import settingsEs from '../../i18n/settings/es.json';
import repositoriesEn from '../../i18n/repositories/en.json';
import repositoriesEs from '../../i18n/repositories/es.json';
import assistantEn from '../../i18n/assistant/en.json';
import assistantEs from '../../i18n/assistant/es.json';

/** Transloco with every catalog preloaded; add scope catalogs here as they appear. */
export function i18nTesting(lang: Language = 'es') {
  return TranslocoTestingModule.forRoot({
    langs: {
      es,
      en,
      'projects/es': projectsEs,
      'projects/en': projectsEn,
      'terminals/es': terminalsEs,
      'terminals/en': terminalsEn,
      'files/es': filesEs,
      'files/en': filesEn,
      'settings/es': settingsEs,
      'settings/en': settingsEn,
      'repositories/es': repositoriesEs,
      'repositories/en': repositoriesEn,
      'assistant/es': assistantEs,
      'assistant/en': assistantEn,
    },
    translocoConfig: {
      availableLangs: ['es', 'en'],
      defaultLang: lang,
      fallbackLang: 'es',
      reRenderOnLangChange: true,
    },
    preloadLangs: true,
  });
}
