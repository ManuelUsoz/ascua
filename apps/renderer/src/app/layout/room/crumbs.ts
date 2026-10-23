import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  type ActivatedRouteSnapshot,
} from '@angular/router';
import { filter, map } from 'rxjs';

/** Crumbs of the current route, recomputed on every NavigationEnd. */
export function injectCrumbs(): Signal<Crumbs> {
  const router = inject(Router);
  const current = () => crumbsFrom(router.routerState.snapshot.root);
  return toSignal(
    router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(current),
    ),
    { initialValue: current() },
  );
}

export interface Crumbs {
  projectId?: string;
  section?: string;
}

/** Reads the project and section the deepest active route stands on. */
export function crumbsFrom(root: ActivatedRouteSnapshot): Crumbs {
  const crumbs: Crumbs = {};
  let route: ActivatedRouteSnapshot | null = root;
  while (route) {
    const projectId = route.params['projectId'];
    if (typeof projectId === 'string') crumbs.projectId = projectId;
    const section = route.data['section'];
    if (typeof section === 'string') crumbs.section = section;
    route = route.firstChild;
  }
  return crumbs;
}
