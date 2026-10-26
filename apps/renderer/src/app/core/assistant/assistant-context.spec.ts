import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ASCUA_API } from '../bridge/ascua-api';
import { SettingsStore } from '../settings/settings-store';
import { AssistantContext } from './assistant-context';

describe('AssistantContext', () => {
  /** Runs effects until the last published context satisfies `ok`. */
  async function until(
    publish: ReturnType<typeof vi.fn>,
    ok: (ctx: any) => boolean, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<void> {
    await vi.waitFor(() => {
      TestBed.tick();
      const last = publish.mock.calls.at(-1)?.[0];
      if (!last || !ok(last)) throw new Error('not yet');
    });
  }

  it('publishes labels on language and the route on navigation, once started', async () => {
    const events = new Subject<unknown>();
    const language = signal('es');
    const assistantContext = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: ASCUA_API, useValue: { assistantContext } },
        { provide: Router, useValue: { url: '/proyectos', events } },
        { provide: SettingsStore, useValue: { language } },
      ],
    });
    const context = TestBed.inject(AssistantContext);
    context.start();
    context.start();
    await until(assistantContext, (c) => c.labels['nav.files'] === 'Archivos');
    expect(assistantContext.mock.calls.at(-1)?.[0].route).toEqual({
      screen: 'projects',
    });

    events.next(new NavigationEnd(1, '/ajustes', '/ajustes'));
    await until(assistantContext, (c) => c.route?.screen === 'settings');

    language.set('en');
    await until(assistantContext, (c) => c.labels['nav.files'] === 'Files');
  });

  it('does nothing without the desktop api', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ASCUA_API, useValue: null },
        { provide: Router, useValue: { url: '/', events: new Subject() } },
        { provide: SettingsStore, useValue: { language: signal('es') } },
      ],
    });
    expect(() => TestBed.inject(AssistantContext).start()).not.toThrow();
  });
});
