import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { RepositoriesPage } from './repositories-page';

export default [
  {
    path: '',
    component: RepositoriesPage,
    providers: [provideTranslocoScope('repositories')],
    resolve: { repositories: scopeResolver('repositories') },
  },
] satisfies Routes;
