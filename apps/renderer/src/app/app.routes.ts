import { Route } from '@angular/router';

/**
 * Screens shown inside the room. Each feature lives in `features/<name>/` and
 * default-exports its routes from `<name>.routes.ts`; register it here with
 * `loadChildren` so it stays out of the initial bundle.
 */
export const appRoutes: Route[] = [
  {
    path: 'source-control',
    loadChildren: () =>
      import('./features/source-control/source-control.routes'),
  },
  { path: '', loadChildren: () => import('./features/home/home.routes') },
  { path: '**', redirectTo: '' },
];
