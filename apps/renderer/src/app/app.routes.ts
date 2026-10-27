import { Route } from '@angular/router';

/**
 * Screens shown inside the room. Each feature lives in `features/<name>/` and
 * default-exports its routes from `<name>.routes.ts`; register it here with
 * `loadChildren` so it stays out of the initial bundle. `data.area` is the
 * `nav.*` key of the rail item the breadcrumb shows when no project is open.
 */
export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'proyectos' },
  {
    path: 'proyectos',
    loadChildren: () => import('./features/projects/projects.routes'),
    data: { area: 'nav.projects' },
  },
  {
    path: 'repositorios',
    loadChildren: () => import('./features/repositories/repositories.routes'),
    data: { area: 'nav.repositories', side: 'repositories' },
  },
  {
    path: 'asistente',
    loadChildren: () => import('./features/assistant/assistant.routes'),
    data: { area: 'nav.assistant' },
  },
  {
    path: 'ajustes',
    loadChildren: () => import('./features/settings/settings.routes'),
    data: { area: 'nav.settings' },
  },
  { path: '**', redirectTo: 'proyectos' },
];
