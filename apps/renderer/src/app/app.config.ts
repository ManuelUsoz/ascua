import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
  withRouterConfig,
} from '@angular/router';
import { appRoutes } from './app.routes';
import { provideAscuaI18n } from './core/i18n/provide-i18n';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAscuaI18n(),
    // The packaged renderer loads index.html from file://, where path URLs
    // cannot be reloaded.
    provideRouter(
      appRoutes,
      withHashLocation(),
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
  ],
};
