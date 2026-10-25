import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { AscuaError, Language, Project } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
import { ProjectStore } from '../../core/projects/project-store';
import { TerminalSessions } from '../../core/terminals/terminal-sessions';
import { i18nTesting } from '../../testing/i18n';
import { ProjectPage } from './project-page';

const project: Project = {
  id: 'p',
  name: 'Mi proyecto',
  path: '/p',
  terminals: [
    { id: 'a', name: 'a', command: 'x' },
    { id: 'b', name: 'b', command: 'y' },
  ],
};

describe('ProjectPage', () => {
  const running = signal(1);
  const errors = signal<Record<string, AscuaError>>({});
  const sessions = {
    counts: vi.fn(() => ({ running: running(), total: 3 })),
    shellError: vi.fn((id: string) => errors()[id]),
    openShell: vi.fn(),
    stopAll: vi.fn(),
  };
  const store = {
    byId: (id: string) => (id === 'p' ? project : undefined),
    loaded: () => true,
  };

  function render(lang: Language = 'es') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectPage, i18nTesting(lang)],
      providers: [
        provideRouter([]),
        { provide: ProjectStore, useValue: store },
        { provide: TerminalSessions, useValue: sessions },
        provideTranslocoScope('projects'),
      ],
    });
    const fixture = TestBed.createComponent(ProjectPage);
    fixture.componentRef.setInput('projectId', 'p');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const buttonText = (label: string) =>
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes(label),
      );
    return { fixture, el, buttonText };
  }

  beforeEach(() => {
    running.set(1);
    errors.set({});
    vi.clearAllMocks();
  });

  it('shows the running chip in Spanish', () => {
    const { el } = render();
    expect(el.querySelector('h1')?.textContent).toBe('Mi proyecto');
    expect(el.textContent).toContain('1 de 3 corriendo');
  });

  it('shows the running chip in English', () => {
    const { el } = render('en');
    expect(el.textContent).toContain('1 of 3 running');
    expect(el.textContent).toContain('Stop all');
  });

  it('stops the project and disables Detener todo when nothing runs', () => {
    render().buttonText('Detener todo')?.click();
    expect(sessions.stopAll).toHaveBeenCalledWith(project);
    running.set(0);
    expect(render().buttonText('Detener todo')?.disabled).toBe(true);
  });

  it('shows only the shell error of this project', () => {
    errors.set({ other: { code: 'terminal.openFailed' } });
    expect(render().el.querySelector('[role=alert]')).toBeNull();
    errors.set({ p: { code: 'terminal.openFailed' } });
    expect(render().el.querySelector('[role=alert]')?.textContent).toContain(
      'No se pudo abrir la terminal',
    );
  });

  it('links the header New chat action to chats/nuevo', () => {
    const { el } = render();
    const link = Array.from(el.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Nuevo chat'),
    );
    expect(link?.getAttribute('href')).toMatch(/chats\/nuevo$/);
  });

  it('navigates to terminales only when the shell opened', async () => {
    const { fixture, buttonText } = render();
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    sessions.openShell.mockResolvedValueOnce(undefined);
    buttonText('Terminal')?.click();
    await fixture.whenStable();
    expect(navigate).not.toHaveBeenCalled();

    sessions.openShell.mockResolvedValueOnce({ status: 'running' });
    buttonText('Terminal')?.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['terminales'], expect.anything());
  });
});
