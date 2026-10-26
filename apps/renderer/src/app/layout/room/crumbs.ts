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
  /** A `nav.*` catalog key: the rail area the route belongs to. */
  area?: string;
  /** A `nav.*` catalog key. */
  section?: string;
  /** Which context the room's side slot shows; projects when absent. */
  side?: 'projects' | 'repositories' | 'notes';
  /** The note name a `/notas/<name>` route stands on. */
  note?: string;
}

/** Reads the project and section the deepest active route stands on. */
export function crumbsFrom(root: ActivatedRouteSnapshot): Crumbs {
  const crumbs: Crumbs = {};
  let route: ActivatedRouteSnapshot | null = root;
  while (route) {
    const projectId = route.params['projectId'];
    if (typeof projectId === 'string') crumbs.projectId = projectId;
    const area = route.data['area'];
    if (typeof area === 'string') crumbs.area = area;
    const section = route.data['section'];
    if (typeof section === 'string') crumbs.section = section;
    const side = route.data['side'];
    if (side === 'projects' || side === 'repositories' || side === 'notes')
      crumbs.side = side;
    if (crumbs.side === 'notes') {
      const name = route.params['name'];
      if (typeof name === 'string') crumbs.note = name;
    }
    route = route.firstChild;
  }
  return crumbs;
}
