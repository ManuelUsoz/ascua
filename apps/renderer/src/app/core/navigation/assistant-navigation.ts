import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import type { NavigateTarget } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';

/** The router commands for a target the assistant asked main to show. */
export function routeFor(target: NavigateTarget): string[] {
  switch (target.screen) {
    case 'projects':
      return ['/proyectos'];
    case 'project': {
      const base = ['/proyectos', target.projectId];
      if (target.tab === 'terminals') return [...base, 'terminales'];
      if (target.tab === 'files') return [...base, 'archivos'];
      return base;
    }
    case 'repositories':
      return ['/repositorios'];
    case 'settings':
      return ['/ajustes'];
    case 'assistant':
      return ['/asistente'];
  }
}

/** The inverse of `routeFor`: the target a router URL shows, if any. */
export function targetFor(url: string): NavigateTarget | undefined {
  const path = url.split(/[?#]/)[0];
  const [first, projectId, tab] = path.split('/').filter(Boolean);
  switch (first) {
    case 'proyectos':
      if (!projectId) return { screen: 'projects' };
      if (tab === 'terminales')
        return { screen: 'project', projectId, tab: 'terminals' };
      if (tab === 'archivos')
        return { screen: 'project', projectId, tab: 'files' };
      return { screen: 'project', projectId };
    case 'repositorios':
      return { screen: 'repositories' };
    case 'ajustes':
      return { screen: 'settings' };
    case 'asistente':
      return { screen: 'assistant' };
    default:
      return undefined;
  }
}

/** Applies main-initiated navigation (the assistant's `navigate` tool). */
@Injectable({ providedIn: 'root' })
export class AssistantNavigation {
  private readonly api = inject(ASCUA_API);
  private readonly router = inject(Router);
  private started = false;

  start(): void {
    if (this.started || !this.api) return;
    this.started = true;
    this.api.onAssistantNavigate((target) => {
      void this.router.navigate(routeFor(target));
    });
  }
}
