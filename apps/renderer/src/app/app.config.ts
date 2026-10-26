import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
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
import { AssistantStore } from './core/assistant/assistant-store';
import { PushToTalkKey } from './core/voice/push-to-talk-key';
import { VoiceStore } from './core/voice/voice-store';
import { AssistantContext } from './core/assistant/assistant-context';
import { AssistantNavigation } from './core/navigation/assistant-navigation';
import { provideAscuaI18n } from './core/i18n/provide-i18n';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAscuaI18n(),
    provideAppInitializer(() => {
      inject(AssistantNavigation).start();
      inject(AssistantContext).start();
      inject(AssistantStore).listen();
      inject(VoiceStore).start();
      inject(PushToTalkKey).start();
    }),
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
