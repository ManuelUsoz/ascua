import { Route } from '@angular/router';

/**
 * Screens shown inside the room. Each feature lives in `features/<name>/` and
 * default-exports its routes from `<name>.routes.ts`; register it here with
 * `loadChildren` so it stays out of the initial bundle.
 */
export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'proyectos' },
  {
    path: 'proyectos',
    loadChildren: () => import('./features/projects/projects.routes'),
  },
  { path: '**', redirectTo: 'proyectos' },
];
