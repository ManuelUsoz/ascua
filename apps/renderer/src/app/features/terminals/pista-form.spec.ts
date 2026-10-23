import { TestBed } from '@angular/core/testing';
import type { SaveProjectResult, TerminalSpec } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
import { ProjectStore } from '../../core/projects/project-store';
import { i18nTesting } from '../../testing/i18n';
import { PistaEditor } from './pista-editor';
import { PistaForm } from './pista-form';

const spec: TerminalSpec = {
  id: 't1',
  name: 'api',
  command: 'npm start',
  cwd: 'web',
  port: 3000,
};
const okResult: SaveProjectResult = {
  ok: true,
  project: { id: 'p', name: 'P', path: '/p', terminals: [spec] },
};

describe('PistaForm', () => {
  const store = {
    savePista: vi.fn(),
    removePista: vi.fn(),
    pickPistaFolder: vi.fn(),
  };
  let editor: PistaEditor;

  function render(pista?: TerminalSpec) {
    TestBed.configureTestingModule({
      imports: [PistaForm, i18nTesting()],
      providers: [
        PistaEditor,
        { provide: ProjectStore, useValue: store },
        provideTranslocoScope('terminals'),
      ],
    });
    editor = TestBed.inject(PistaEditor);
    editor.create();
    const fixture = TestBed.createComponent(PistaForm);
    fixture.componentRef.setInput('projectId', 'p');
    if (pista) fixture.componentRef.setInput('spec', pista);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const input = (id: string) =>
      el.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;
    const type = (id: string, value: string) => {
      const field = input(id);
      field.value = value;
      field.dispatchEvent(new Event('input'));
    };
    const buttonText = (label: string) =>
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes(label),
      );
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, el, input, type, buttonText, settle };
  }

  beforeEach(() => vi.resetAllMocks());

  it('creates a pista with the trimmed input', async () => {
    store.savePista.mockResolvedValue(okResult);
    const { el, type, settle } = render();
    expect(el.querySelector('form')?.getAttribute('aria-label')).toBe(
      'Nueva pista',
    );
    type('pista-name', ' web ');
    type('pista-cmd', ' npm run dev ');
    type('pista-port', '4200');
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    expect(store.savePista).toHaveBeenCalledWith('p', {
      name: 'web',
      command: 'npm run dev',
      port: 4200,
    });
    expect(editor.draft()).toBeUndefined();
  });

  it('pre-fills when editing and keeps the id', async () => {
    store.savePista.mockResolvedValue(okResult);
    const { el, input, settle } = render(spec);
    expect(el.querySelector('form')?.getAttribute('aria-label')).toBe(
      'Editar pista',
    );
    expect(input('pista-name').value).toBe('api');
    expect(input('pista-cmd').value).toBe('npm start');
    expect(input('pista-port').value).toBe('3000');
    expect(el.textContent).toContain('web/');
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    expect(store.savePista).toHaveBeenCalledWith('p', spec);
  });

  it('shows a translated error and stays open', async () => {
    store.savePista.mockResolvedValue({
      ok: false,
      error: {
        code: 'project.terminalCommandRequired',
        params: { name: 'api' },
      },
    });
    const { el, settle } = render();
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      '"api" necesita un comando.',
    );
    expect(editor.draft()).toBe('new');
  });

  it('falls back to the generic text when saving throws', async () => {
    store.savePista.mockRejectedValue(new Error('boom'));
    const { el, settle } = render();
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'No se pudo guardar la pista',
    );
  });

  it('picks a folder and shows the folder error', async () => {
    store.pickPistaFolder.mockResolvedValueOnce({ ok: true, cwd: 'web/app' });
    const { el, buttonText, settle } = render();
    buttonText('raíz del proyecto')?.click();
    await settle();
    expect(el.textContent).toContain('web/app/');

    store.pickPistaFolder.mockResolvedValueOnce({
      ok: false,
      error: { code: 'project.folderOutside' },
    });
    buttonText('web/app/')?.click();
    await settle();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'La carpeta tiene que estar dentro del proyecto.',
    );
  });

  it('needs two clicks to remove a pista', async () => {
    store.removePista.mockResolvedValue(okResult);
    const { buttonText, settle } = render(spec);
    buttonText('Quitar pista')?.click();
    await settle();
    expect(store.removePista).not.toHaveBeenCalled();
    buttonText('¿Seguro? Quitar')?.click();
    await settle();
    expect(store.removePista).toHaveBeenCalledWith('p', 't1');
    expect(editor.draft()).toBeUndefined();
  });

  it('closes on Escape without letting it reach the room', () => {
    const { el } = render();
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });
    const stop = vi.spyOn(event, 'stopPropagation');
    el.querySelector('form')?.dispatchEvent(event);
    expect(stop).toHaveBeenCalled();
    expect(editor.draft()).toBeUndefined();
  });
});
