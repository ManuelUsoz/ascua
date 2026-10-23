import { Routes } from '@angular/router';
import { ProjectFormPage } from './project-form-page';
import { ProjectPage } from './project-page';
import { ProjectsIndexPage } from './projects-index-page';

// `nuevo` and `:projectId/editar` come before `:projectId` so they win.
export default [
  { path: '', component: ProjectsIndexPage },
  {
    path: 'nuevo',
    component: ProjectFormPage,
    data: { section: 'Nuevo proyecto' },
  },
  {
    path: ':projectId/editar',
    component: ProjectFormPage,
    data: { section: 'Editar' },
  },
  {
    path: ':projectId',
    component: ProjectPage,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'terminales' },
      {
        path: 'terminales',
        loadChildren: () => import('../terminals/terminals.routes'),
        data: { section: 'Terminales' },
      },
      {
        path: 'archivos',
        loadChildren: () => import('../files/files.routes'),
        data: { section: 'Archivos' },
      },
    ],
  },
] satisfies Routes;
