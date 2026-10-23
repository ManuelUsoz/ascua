import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { SettingsPage } from './settings-page';

export default [
  {
    path: '',
    component: SettingsPage,
    providers: [provideTranslocoScope('settings')],
    resolve: { settings: scopeResolver('settings') },
  },
] satisfies Routes;
