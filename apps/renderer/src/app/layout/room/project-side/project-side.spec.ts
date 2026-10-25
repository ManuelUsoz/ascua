import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ChatStore } from '../../../core/chats/chat-store';
import { ProjectStore } from '../../../core/projects/project-store';
import { TerminalSessions } from '../../../core/terminals/terminal-sessions';
import { i18nTesting } from '../../../testing/i18n';
import { ProjectSide } from './project-side';

describe('ProjectSide chats', () => {
  it('lists the expanded project chats with links and tones', async () => {
    const ensureLoaded = vi.fn();
    const statuses: Record<string, string> = {
      c1: 'running',
      c2: 'awaitingPermission',
    };
    TestBed.configureTestingModule({
      imports: [ProjectSide, i18nTesting()],
      providers: [
        provideRouter([
          { path: 'proyectos/:projectId/terminales', children: [] },
        ]),
        {
          provide: ProjectStore,
          useValue: {
            projects: signal([{ id: 'p1', name: 'Uno', terminals: [] }]),
          },
        },
        {
          provide: TerminalSessions,
          useValue: {
            counts: () => ({ running: 0, total: 0 }),
            shells: () => [],
            session: () => undefined,
          },
        },
        {
          provide: ChatStore,
          useValue: {
            sessions: () => [
              { id: 'c1', title: 'Hola' },
              { id: 'c2', title: undefined },
            ],
            status: (id: string) => statuses[id],
            ensureLoaded,
          },
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/proyectos/p1/terminales');
    const fixture = TestBed.createComponent(ProjectSide);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(ensureLoaded).toHaveBeenCalledWith('p1');
    const rows = Array.from(
      el.querySelectorAll<HTMLAnchorElement>('a[href*="/chats/"]'),
    );
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('href')).toContain('/proyectos/p1/chats/c1');
    expect(rows[0].textContent).toContain('Hola');
    expect(rows[1].textContent).toContain('Chat sin título');
    expect(rows[0].querySelector('.as-dot')?.getAttribute('data-tone')).toBe(
      'ok',
    );
    expect(rows[1].querySelector('.as-dot')?.getAttribute('data-tone')).toBe(
      'ask',
    );
  });
});
