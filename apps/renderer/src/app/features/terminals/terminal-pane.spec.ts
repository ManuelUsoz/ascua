import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TerminalSession, TerminalSpec } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
import { TerminalSessions } from '../../core/terminals/terminal-sessions';
import { i18nTesting } from '../../testing/i18n';
import { PistaEditor } from './pista-editor';
import { TerminalPane } from './terminal-pane';
import { TerminalView } from './terminal-view';

@Component({ selector: 'app-terminal-view', template: '' })
class TerminalViewStub {
  readonly sessionId = input.required<string>();
}

const spec: TerminalSpec = {
  id: 't1',
  name: 'api',
  command: 'npm run dev',
  port: 3000,
};

describe('TerminalPane', () => {
  const current = signal<TerminalSession | undefined>(undefined);
  const sessions = {
    session: vi.fn(() => current()),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  function session(status: TerminalSession['status']): TerminalSession {
    return {
      id: 'p:t1',
      projectId: 'p',
      terminalId: 't1',
      kind: 'pista',
      status,
    };
  }

  function render(pista: TerminalSpec | undefined, name = 'api') {
    TestBed.configureTestingModule({
      imports: [TerminalPane, i18nTesting()],
      providers: [
        PistaEditor,
        { provide: TerminalSessions, useValue: sessions },
        provideTranslocoScope('terminals'),
      ],
    }).overrideComponent(TerminalPane, {
      remove: { imports: [TerminalView] },
      add: { imports: [TerminalViewStub] },
    });
    const fixture = TestBed.createComponent(TerminalPane);
    fixture.componentRef.setInput('projectId', 'p');
    fixture.componentRef.setInput('terminalId', 't1');
    fixture.componentRef.setInput('name', name);
    if (pista) fixture.componentRef.setInput('spec', pista);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const button = (label: string) =>
      el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    return { fixture, el, button };
  }

  beforeEach(() => {
    current.set(undefined);
    vi.clearAllMocks();
  });

  it('shows the port, the command and the idle text without a session', () => {
    const { el } = render(spec);
    expect(el.textContent).toContain(':3000');
    expect(el.textContent).toContain('npm run dev');
    expect(el.textContent).toContain('Detenida — iniciá para ver la salida');
    expect(el.querySelector('app-terminal-view')).toBeNull();
  });

  it('starts a stopped pista and stops a running one', () => {
    current.set(session('stopped'));
    const { fixture, button } = render(spec);
    expect(fixture.nativeElement.textContent).toContain('Detenido');
    button('Iniciar api')?.click();
    expect(sessions.start).toHaveBeenCalledWith('p', 't1');

    current.set(session('running'));
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('app-terminal-view'),
    ).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Corriendo');
    button('Detener api')?.click();
    expect(sessions.stop).toHaveBeenCalledWith('p', 't1');
  });

  it('opens the editor with the spec', () => {
    const { button } = render(spec);
    button('Editar api')?.click();
    expect(TestBed.inject(PistaEditor).draft()).toEqual(spec);
  });

  it('offers Cerrar always and Reabrir only while a shell is stopped', () => {
    current.set(session('running'));
    const { fixture, button } = render(undefined, 'shell');
    expect(button('Reabrir shell')).toBeNull();
    button('Cerrar shell')?.click();
    expect(sessions.close).toHaveBeenCalledWith('p', 't1');

    current.set(session('stopped'));
    fixture.detectChanges();
    button('Reabrir shell')?.click();
    expect(sessions.start).toHaveBeenCalledWith('p', 't1');
    expect(button('Editar shell')).toBeNull();
  });
});
