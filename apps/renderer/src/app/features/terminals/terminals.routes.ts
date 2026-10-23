import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { TerminalsPage } from './terminals-page';

export default [
  {
    path: '',
    component: TerminalsPage,
    providers: [provideTranslocoScope('terminals')],
    resolve: { terminals: scopeResolver('terminals') },
  },
] satisfies Routes;
