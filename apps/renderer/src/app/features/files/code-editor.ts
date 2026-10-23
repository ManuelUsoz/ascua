import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { languageFor, lineSeparatorFor, type EditorLanguage } from './editor-model';
import { editorTheme } from './editor-theme';

export interface EditorDoc {
  path: string;
  text: string;
  loadId: number;
  /** False renders the file read-only. */
  editable?: boolean;
}

function languageExtension(language: EditorLanguage | undefined): Extension {
  switch (language) {
    case 'typescript':
      return javascript({ typescript: true, jsx: true });
    case 'javascript':
      return javascript({ jsx: true });
    case 'json':
      return json();
    case 'html':
      return html();
    case 'css':
      return css();
    case 'markdown':
      return markdown();
    default:
      return [];
  }
}

/** CodeMirror 6 editor for one text file; a new `loadId` or `path` resets it. */
@Component({
  selector: 'app-code-editor',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'display: block; min-height: 0',
    // Escape belongs to the editor here; app.ts would collapse the room.
    '(keydown.escape)': '$event.stopPropagation()',
  },
})
export class CodeEditor {
  readonly doc = input.required<EditorDoc | undefined>();
  readonly dirtyChange = output<boolean>();
  readonly save = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private view: EditorView | undefined;
  private saved = '';
  private loaded: { path: string; loadId: number } | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.view?.destroy();
      this.view = undefined;
    });
    afterNextRender(() => {
      this.view = new EditorView({ parent: this.host, state: EditorState.create({ doc: '' }) });
      this.sync();
    });
    effect(() => {
      this.doc();
      this.sync();
    });
  }

  /** Current editor text (CRLF preserved). */
  text(): string {
    return this.view ? this.view.state.sliceDoc() : this.saved;
  }

  private sync(): void {
    const view = this.view;
    const doc = this.doc();
    if (!view || !doc) return;
    this.saved = doc.text;
    if (this.loaded?.path === doc.path && this.loaded.loadId === doc.loadId) {
      this.dirtyChange.emit(view.state.sliceDoc() !== this.saved);
      return;
    }
    this.loaded = { path: doc.path, loadId: doc.loadId };
    view.setState(this.createState(doc));
    this.dirtyChange.emit(false);
  }

  private createState(doc: EditorDoc): EditorState {
    return EditorState.create({
      doc: doc.text,
      extensions: [
        EditorState.lineSeparator.of(lineSeparatorFor(doc.text)),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        languageExtension(languageFor(doc.path)),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: (v) => {
              this.save.emit(v.state.sliceDoc());
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        editorTheme,
        doc.editable === false
          ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
          : [],
        EditorView.updateListener.of((update) => {
          if (update.docChanged) this.dirtyChange.emit(update.state.sliceDoc() !== this.saved);
        }),
      ],
    });
  }
}
