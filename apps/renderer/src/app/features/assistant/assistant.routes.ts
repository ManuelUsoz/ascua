import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { AssistantPage } from './assistant-page';

export default [
  {
    path: '',
    component: AssistantPage,
    providers: [provideTranslocoScope('assistant')],
    resolve: { assistant: scopeResolver('assistant') },
  },
] satisfies Routes;
