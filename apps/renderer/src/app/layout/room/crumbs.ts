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
  side?: 'projects' | 'repositories';
  /** The selected repository id (`owner/name`) from the route. */
  repoId?: string;
  /** The selected pull request number; ignored unless a positive integer. */
  prNumber?: number;
  /** The selected commit sha from the route. */
  commitSha?: string;
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
    if (side === 'projects' || side === 'repositories') crumbs.side = side;
    const repoId = route.params['repoId'];
    if (typeof repoId === 'string') crumbs.repoId = repoId;
    const number = route.params['number'];
    if (typeof number === 'string') {
      const n = Number(number);
      if (Number.isInteger(n) && n > 0) crumbs.prNumber = n;
    }
    const sha = route.params['sha'];
    if (typeof sha === 'string') crumbs.commitSha = sha;
    route = route.firstChild;
  }
  return crumbs;
}
