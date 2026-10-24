import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { RepositoriesPage } from './repositories-page';
import { RepositoryRoute } from './repository-route';

/**
 * The URL is the selection. The leaf children only carry params (the page has
 * no outlet); the page reads them through the crumbs path walker. A repo id
 * like `octo/name` is one encoded segment.
 */
export default [
  {
    path: '',
    component: RepositoriesPage,
    providers: [provideTranslocoScope('repositories')],
    resolve: { repositories: scopeResolver('repositories') },
    children: [
      { path: ':repoId', component: RepositoryRoute },
      { path: ':repoId/commits/:sha', component: RepositoryRoute },
      { path: ':repoId/prs/:number', component: RepositoryRoute },
      {
        path: ':repoId/prs/:number/commits/:sha',
        component: RepositoryRoute,
      },
    ],
  },
] satisfies Routes;
