import { ChangeDetectionStrategy, Component, computed, effect, inject, input, viewChild } from '@angular/core';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { Icon } from '../../shared/icon/icon';
import { CodeEditor } from './code-editor';
import { FileBrowser } from './file-browser';

/** Archivos tab: tree, "Ir a archivo…" filter and an in-place CodeMirror editor. */
@Component({
  selector: 'app-files-page',
  imports: [Icon, CodeEditor],
  templateUrl: './files-page.html',
  providers: [FileBrowser],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilesPage {
  readonly projectId = input.required<string>();

  protected readonly browser = inject(FileBrowser);

  protected readonly unsaved = inject(UnsavedChanges);
  private readonly editor = viewChild(CodeEditor);
  protected readonly openable = computed(() => {
    return this.browser.baseline()?.openable === true;
  });
  protected readonly status = computed(() => {
    const c = this.browser.content();
    if (!c || 'error' in c) return undefined;
    if (c.kind === 'binary') return 'Archivo binario';
    if (c.kind === 'too-large') return `Archivo muy grande (${Math.ceil(c.size / 1024)} KB)`;
    return undefined;
  });
  protected readonly error = computed(() => {
    const c = this.browser.content();
    return c && 'error' in c ? c.error : undefined;
  });

  constructor() {
    effect(() => this.browser.load(this.projectId()));
  }

  protected editorText(): string {
    return this.editor()?.text() ?? '';
  }

  protected onQuery(event: Event): void {
    this.browser.query.set((event.target as HTMLInputElement).value);
  }

  protected clearQuery(event: Event): void {
    if (!this.browser.query()) return;
    event.stopPropagation();
    this.browser.query.set('');
    (event.target as HTMLInputElement).value = '';
  }

  protected dirState(state: unknown): string | undefined {
    return typeof state === 'object' && state !== null && 'error' in state
      ? String((state as { error: string }).error)
      : undefined;
  }
}
