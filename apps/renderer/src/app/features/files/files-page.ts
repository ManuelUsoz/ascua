import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import type { AscuaError } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorText } from '../../core/i18n/app-error';
import { text } from '../../core/i18n/text';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { CodeEditor } from './code-editor';
import { FileBrowser } from './file-browser';

/** Archivos tab: tree, "Ir a archivo…" filter and an in-place CodeMirror editor. */
@Component({
  selector: 'app-files-page',
  imports: [Button, Icon, CodeEditor, TranslocoPipe],
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
    if (c.kind === 'binary') return text('files.binary');
    if (c.kind === 'too-large')
      return text('files.tooLarge', { kb: Math.ceil(c.size / 1024) });
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

  /** The catalog entry of a failure, for `key | transloco: params`. */
  protected readonly errorText = errorText;

  protected dirState(state: unknown): AscuaError | undefined {
    return typeof state === 'object' && state !== null && 'error' in state
      ? (state as { error: AscuaError }).error
      : undefined;
  }
}
