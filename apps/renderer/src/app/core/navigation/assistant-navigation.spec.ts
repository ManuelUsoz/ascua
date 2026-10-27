import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { AscuaApi, NavigateTarget } from '@ascua/ipc';
import { describe, expect, it, vi } from 'vitest';
import { ASCUA_API } from '../bridge/ascua-api';
import {
  AssistantNavigation,
  routeFor,
  targetFor,
} from './assistant-navigation';

describe('routeFor', () => {
  it('maps every target to its route', () => {
    expect(routeFor({ screen: 'projects' })).toEqual(['/proyectos']);
    expect(routeFor({ screen: 'project', projectId: 'p1' })).toEqual([
      '/proyectos',
      'p1',
    ]);
    expect(
      routeFor({ screen: 'project', projectId: 'p1', tab: 'terminals' }),
    ).toEqual(['/proyectos', 'p1', 'terminales']);
    expect(
      routeFor({ screen: 'project', projectId: 'p1', tab: 'files' }),
    ).toEqual(['/proyectos', 'p1', 'archivos']);
    expect(routeFor({ screen: 'repositories' })).toEqual(['/repositorios']);
    expect(routeFor({ screen: 'settings' })).toEqual(['/ajustes']);
    expect(routeFor({ screen: 'assistant' })).toEqual(['/asistente']);
  });
});

describe('targetFor', () => {
  it('is the inverse of routeFor', () => {
    const targets: NavigateTarget[] = [
      { screen: 'projects' },
      { screen: 'project', projectId: 'p1' },
      { screen: 'project', projectId: 'p1', tab: 'terminals' },
      { screen: 'project', projectId: 'p1', tab: 'files' },
      { screen: 'repositories' },
      { screen: 'settings' },
      { screen: 'assistant' },
    ];
    for (const t of targets) {
      expect(targetFor(routeFor(t).join('/').replace('//', '/'))).toEqual(t);
    }
  });

  it('ignores unknown urls', () => {
    expect(targetFor('/')).toBeUndefined();
  });
});

describe('AssistantNavigation', () => {
  it('navigates when main sends a target, once', () => {
    let emit: (t: NavigateTarget) => void = () => undefined;
    const api = {
      onAssistantNavigate: vi.fn((cb: (t: NavigateTarget) => void) => {
        emit = cb;
        return () => undefined;
      }),
    } as unknown as AscuaApi;
    const navigate = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      providers: [
        { provide: ASCUA_API, useValue: api },
        { provide: Router, useValue: { navigate } },
      ],
    });
    const nav = TestBed.inject(AssistantNavigation);
    nav.start();
    nav.start();
    expect(api.onAssistantNavigate).toHaveBeenCalledTimes(1);
    emit({ screen: 'settings' });
    expect(navigate).toHaveBeenCalledWith(['/ajustes']);
  });

  it('is a no-op without the API', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ASCUA_API, useValue: undefined },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    expect(() => TestBed.inject(AssistantNavigation).start()).not.toThrow();
  });
});
