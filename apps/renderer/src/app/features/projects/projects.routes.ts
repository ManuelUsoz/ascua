import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { scopeResolver } from '../../core/i18n/provide-i18n';
import { ProjectFormPage } from './project-form-page';
import { ProjectPage } from './project-page';
import { ProjectsIndexPage } from './projects-index-page';

// `nuevo` and `:projectId/editar` come before `:projectId` so they win.
// The terminals scope is here too: the project page hosts the pista form.
export default [
  {
    path: '',
    providers: [
      provideTranslocoScope('projects'),
      provideTranslocoScope('terminals'),
    ],
    resolve: {
      projects: scopeResolver('projects'),
      terminals: scopeResolver('terminals'),
    },
    children: [
      { path: '', component: ProjectsIndexPage },
      {
        path: 'nuevo',
        component: ProjectFormPage,
        data: { section: 'nav.newProject' },
      },
      {
        path: ':projectId/editar',
        component: ProjectFormPage,
        data: { section: 'nav.edit' },
      },
      {
        path: ':projectId',
        component: ProjectPage,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'terminales' },
          {
            path: 'terminales',
            loadChildren: () => import('../terminals/terminals.routes'),
            data: { section: 'nav.terminals' },
          },
          {
            path: 'archivos',
            loadChildren: () => import('../files/files.routes'),
            data: { section: 'nav.files' },
          },
        ],
      },
    ],
  },
] satisfies Routes;
