import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslocoScope } from '@jsverse/transloco';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { i18nTesting } from '../../testing/i18n';
import { CodeEditor } from './code-editor';
import { FileBrowser, type ViewContent } from './file-browser';
import { FilesPage } from './files-page';

@Component({
  selector: 'app-code-editor',
  template: '',
  // FilesPage reads the editor with viewChild(CodeEditor): answer to that token.
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

type Baseline = NonNullable<
  FileBrowser['baseline'] extends () => infer B ? B : never
>;

function fakeBrowser() {
  return {
    load: vi.fn(),
    ensureIndex: vi.fn(),
    open: vi.fn(),
    toggle: vi.fn(),
    save: vi.fn(),
    reload: vi.fn(),
    setDirty: vi.fn(),
    openInEditor: vi.fn(),
    reveal: vi.fn(),
    query: signal(''),
    root: signal<unknown>([]),
    rows: signal<unknown[]>([]),
    results: signal<string[]>([]),
    index: signal<unknown>(undefined),
    indexError: signal<unknown>(undefined),
    expanded: signal(new Set<string>()),
    selected: signal<string | undefined>('a.txt'),
    content: signal<ViewContent | undefined>(undefined),
    baseline: signal<Baseline | undefined>(undefined),
    openError: signal<unknown>(undefined),
    saveError: signal<unknown>(undefined),
    dirty: signal(false),
    saving: signal(false),
    conflict: signal(false),
  };
}

const doc = (over: Partial<Baseline> = {}): Baseline => ({
  path: 'a.txt',
  text: 'hi',
  version: '1',
  loadId: 1,
  editable: true,
  openable: false,
  ...over,
});

describe('FilesPage', () => {
  let browser: ReturnType<typeof fakeBrowser>;

  function render(lang: 'es' | 'en' = 'es') {
    TestBed.configureTestingModule({
      imports: [FilesPage, i18nTesting(lang)],
      providers: [provideTranslocoScope('files')],
    }).overrideComponent(FilesPage, {
      remove: { imports: [CodeEditor], providers: [FileBrowser] },
      add: {
        imports: [CodeEditorStub],
        providers: [{ provide: FileBrowser, useValue: browser }],
      },
    });
    const fixture = TestBed.createComponent(FilesPage);
    fixture.componentRef.setInput('projectId', 'p');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const button = (label: string) =>
      [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(label),
      );
    return { fixture, el, button };
  }

  beforeEach(() => {
    browser = fakeBrowser();
  });

  it('asks to pick a file when nothing is selected', () => {
    browser.selected.set(undefined);
    expect(render().el.textContent).toContain('Elegí un archivo');
  });

  it('says so in English', () => {
    browser.selected.set(undefined);
    expect(render('en').el.textContent).toContain('Pick a file');
  });

  it('shows loading, binary and too-large states', () => {
    const { fixture, el } = render();
    expect(el.querySelector('.as-files__empty')?.textContent).toContain(
      'Cargando…',
    );

    browser.content.set({ kind: 'binary', size: 10 } as ViewContent);
    fixture.detectChanges();
    expect(el.querySelector('.as-files__empty')?.textContent).toContain(
      'Archivo binario',
    );

    browser.content.set({
      kind: 'too-large',
      size: 2048 * 1024,
    } as ViewContent);
    fixture.detectChanges();
    expect(el.querySelector('.as-files__empty')?.textContent).toContain(
      'Archivo muy grande (2048 KB)',
    );
  });

  it('renders a failed read as a translated alert', () => {
    browser.content.set({ error: { code: 'file.gone' } });
    const { el } = render();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'El archivo ya no existe.',
    );
  });

  it('notes a read-only file', () => {
    browser.baseline.set(doc({ editable: false }));
    const { el } = render();
    expect(el.querySelector('#file-readonly')?.textContent).toContain(
      'Solo lectura: el archivo no está en UTF-8.',
    );
    expect(el.querySelector('#file-save')).toBeNull();
  });

  it('offers Abrir en editor when openable and Mostrar en carpeta otherwise', () => {
    browser.baseline.set(doc({ openable: true }));
    const { fixture, button } = render();
    expect(button('Mostrar en carpeta')).toBeUndefined();
    button('Abrir en editor')?.click();
    expect(browser.openInEditor).toHaveBeenCalled();

    browser.baseline.set(doc({ openable: false }));
    fixture.detectChanges();
    expect(button('Abrir en editor')).toBeUndefined();
    button('Mostrar en carpeta')?.click();
    expect(browser.reveal).toHaveBeenCalled();
  });

  it('resolves a conflict by overwriting or reloading', () => {
    browser.baseline.set(doc());
    browser.conflict.set(true);
    const { el, button } = render();
    expect(el.textContent).toContain('El archivo cambió en disco.');
    button('Sobrescribir')?.click();
    expect(browser.save).toHaveBeenCalledWith('edited', true);
    button('Recargar')?.click();
    expect(browser.reload).toHaveBeenCalled();
  });

  it('forwards the unsaved question to UnsavedChanges', () => {
    browser.baseline.set(doc());
    const { fixture, el, button } = render();
    const unsaved = TestBed.inject(UnsavedChanges);
    const answer = vi.spyOn(unsaved, 'answer');
    unsaved.dirty.set(true);
    void unsaved.confirmDiscard('a.txt');
    fixture.detectChanges();
    expect(el.textContent).toContain('Tenés cambios sin guardar.');
    button('Seguir editando')?.click();
    expect(answer).toHaveBeenCalledWith(false);

    void unsaved.confirmDiscard('a.txt');
    fixture.detectChanges();
    button('Descartar')?.click();
    expect(answer).toHaveBeenCalledWith(true);
  });
});
