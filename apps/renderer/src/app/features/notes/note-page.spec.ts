import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { encodeError, type AscuaApi } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { i18nTesting } from '../../testing/i18n';
import { CodeEditor } from '../files/code-editor';
import { NotePage } from './note-page';

@Component({
  selector: 'app-code-editor',
  template: '',
  providers: [{ provide: CodeEditor, useExisting: CodeEditorStub }],
})
class CodeEditorStub {
  readonly doc = input<unknown>();
  readonly dirtyChange = output<boolean>();
  readonly save = output<string>();
  text(): string {
    return 'edited';
  }
}

describe('NotePage', () => {
  let api: Pick<
    AscuaApi,
    'listNotes' | 'readNote' | 'saveNote' | 'deleteNote' | 'renameNote'
  >;

  async function render(modo?: string) {
    TestBed.configureTestingModule({
      imports: [NotePage, i18nTesting('es')],
      providers: [
        provideRouter([{ path: 'notas', component: CodeEditorStub }]),
        provideTranslocoScope('notes'),
        { provide: ASCUA_API, useValue: api },
      ],
    }).overrideComponent(NotePage, {
      remove: { imports: [CodeEditor] },
      add: { imports: [CodeEditorStub] },
    });
    const fixture = TestBed.createComponent(NotePage);
    fixture.componentRef.setInput('name', 'Ideas');
    if (modo) fixture.componentRef.setInput('modo', modo);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const stub = fixture.debugElement.query((d) => d.name === 'app-code-editor')
      ?.componentInstance as CodeEditorStub | undefined;
    return { fixture, el, stub };
  }

  beforeEach(() => {
    api = {
      listNotes: vi.fn(async () => []),
      readNote: vi.fn(async () => ({
        name: 'Ideas',
        text: '# Ideas\n',
        version: 'v1',
      })),
      saveNote: vi.fn(async () => ({
        ok: true as const,
        version: 'v2',
        size: 6,
      })),
      deleteNote: vi.fn(async () => undefined),
      renameNote: vi.fn(async (_from: string, to: string) => ({
        name: to,
        updatedNotes: 2,
      })),
    };
  });

  function typeName(fixture: { detectChanges(): void }, el: HTMLElement) {
    el.querySelector<HTMLButtonElement>('#note-rename')?.click();
    fixture.detectChanges();
    const input = el.querySelector('#note-rename-input') as HTMLInputElement;
    input.value = 'Nuevo';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return input;
  }

  it('renames, reports updated notes and navigates with replaceUrl', async () => {
    const nav = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    const { fixture, el } = await render('editar');
    typeName(fixture, el);
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.renameNote).toHaveBeenCalledWith('Ideas', 'Nuevo');
    expect(nav).toHaveBeenCalledWith(['/notas', 'Nuevo'], {
      replaceUrl: true,
      queryParams: { modo: 'editar' },
    });
    expect(el.querySelector('[role=status]')?.textContent).toContain(
      'Se actualizaron 2 notas que la enlazaban.',
    );
    nav.mockRestore();
  });

  it('refuses to rename with unsaved changes', async () => {
    const { fixture, el, stub } = await render('editar');
    stub?.dirtyChange.emit(true);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('#note-rename')?.click();
    fixture.detectChanges();
    expect(el.querySelector('#note-rename-input')).toBeNull();
    expect(el.textContent).toContain('Guardá los cambios antes de renombrar.');
    expect(api.renameNote).not.toHaveBeenCalled();
  });

  it('clears the unsaved message once the note is saved', async () => {
    const { fixture, el, stub } = await render('editar');
    stub?.dirtyChange.emit(true);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('#note-rename')?.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Guardá los cambios antes de renombrar.');
    el.querySelector<HTMLButtonElement>('#note-save')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).not.toContain(
      'Guardá los cambios antes de renombrar.',
    );
  });

  it('ignores a second submit while a rename is pending', async () => {
    vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    let release: () => void = () => undefined;
    api.renameNote = vi.fn(
      (_from: string, to: string) =>
        new Promise<{ name: string; updatedNotes: number }>((resolve) => {
          release = () => resolve({ name: to, updatedNotes: 0 });
        }),
    );
    const { fixture, el } = await render();
    typeName(fixture, el);
    const form = el.querySelector('form');
    form?.dispatchEvent(new Event('submit'));
    form?.dispatchEvent(new Event('submit'));
    expect(api.renameNote).toHaveBeenCalledTimes(1);
    release();
    await fixture.whenStable();
  });

  it('shows an invalid name and does not call rename', async () => {
    const { fixture, el } = await render();
    const input = typeName(fixture, el);
    input.value = 'a/b';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.renameNote).not.toHaveBeenCalled();
    expect(el.querySelector('.as-files__err')).not.toBeNull();
  });

  it('shows a note.exists rejection', async () => {
    api.renameNote = vi.fn(async () => {
      throw new Error(encodeError({ code: 'note.exists' }));
    });
    const { fixture, el } = await render();
    typeName(fixture, el);
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('#note-rename-input')).not.toBeNull();
    expect(el.querySelector('.as-files__err')?.textContent).toContain(
      'Ya existe',
    );
  });

  it('closes the rename field on Escape without reaching the window', async () => {
    const { fixture, el } = await render();
    const onWindow = vi.fn();
    window.addEventListener('keydown', onWindow);
    const input = typeName(fixture, el);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    window.removeEventListener('keydown', onWindow);
    expect(el.querySelector('#note-rename-input')).toBeNull();
    expect(onWindow).not.toHaveBeenCalled();
  });

  it('loads the note and shows it rendered', async () => {
    const { el } = await render();
    expect(api.readNote).toHaveBeenCalledWith('Ideas');
    expect(el.querySelector('#note-view h1')?.textContent).toBe('Ideas');
    expect(el.querySelector<HTMLElement>('.as-files__body')?.hidden).toBe(true);
  });

  it('navigates with the fragment when a wiki link is clicked', async () => {
    api.readNote = vi.fn(async () => ({
      name: 'Ideas',
      text: '[[Plan#Fase 1]]',
      version: 'v1',
    }));
    api.listNotes = vi.fn(async () => [
      { name: 'Ideas', headings: [], links: ['Plan'], updatedAt: 1 },
      {
        name: 'Plan',
        headings: [{ level: 2, text: 'Fase 1', slug: 'fase-1' }],
        links: [],
        updatedAt: 1,
      },
    ]);
    const nav = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    const { el } = await render();
    el.querySelector<HTMLAnchorElement>('a.as-note-link')?.click();
    expect(nav).toHaveBeenCalledWith(['/notas', 'Plan'], {
      fragment: 'fase-1',
    });
    nav.mockRestore();
  });

  it('lists the notes that reference this one', async () => {
    api.listNotes = vi.fn(async () => [
      { name: 'Ideas', headings: [], links: [], updatedAt: 1 },
      { name: 'Plan', headings: [], links: ['ideas'], updatedAt: 1 },
    ]);
    const { el } = await render();
    const links = el.querySelectorAll('#note-backlinks a');
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe('Plan');
    expect(el.querySelector('#note-backlinks h2')?.textContent).toBe(
      'Referenciada por',
    );
  });

  it('opens in the editor with modo=editar', async () => {
    const { el } = await render('editar');
    expect(el.querySelector('#note-view')).toBeNull();
    expect(el.querySelector<HTMLElement>('.as-files__body')?.hidden).toBe(
      false,
    );
  });

  it('saves the edited text with the loaded version', async () => {
    const { fixture, el, stub } = await render('editar');
    stub?.dirtyChange.emit(true);
    fixture.detectChanges();
    expect(TestBed.inject(UnsavedChanges).dirty()).toBe(true);
    el.querySelector<HTMLButtonElement>('#note-save')?.click();
    await fixture.whenStable();
    expect(api.saveNote).toHaveBeenCalledWith('Ideas', 'edited', 'v1');
    fixture.detectChanges();
    expect(TestBed.inject(UnsavedChanges).dirty()).toBe(false);
  });

  it('shows the conflict and overwrites without a version', async () => {
    api.saveNote = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, conflict: true })
      .mockResolvedValueOnce({ ok: true, version: 'v3', size: 6 });
    const { fixture, el, stub } = await render('editar');
    stub?.dirtyChange.emit(true);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('#note-save')?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('La nota cambió en disco.');
    const overwrite = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Sobrescribir'),
    );
    overwrite?.click();
    await fixture.whenStable();
    expect(api.saveNote).toHaveBeenLastCalledWith('Ideas', 'edited', undefined);
  });

  it('deletes only after a second click', async () => {
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('#note-delete')?.click();
    fixture.detectChanges();
    expect(api.deleteNote).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>('#note-delete-yes')?.click();
    await fixture.whenStable();
    expect(api.deleteNote).toHaveBeenCalledWith('Ideas');
  });
});
