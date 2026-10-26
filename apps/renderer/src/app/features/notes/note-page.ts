import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AscuaError } from '@ascua/ipc';
import { headingSlug, noteNameError, type WikiLink } from '@ascua/notes';
import { TranslocoPipe } from '@jsverse/transloco';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { errorText, toAscuaError } from '../../core/i18n/app-error';
import { pluralKey } from '../../core/i18n/text';
import { NoteStore } from '../../core/notes/note-store';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { Icon } from '../../shared/icon/icon';
import { CodeEditor, type EditorDoc } from '../files/code-editor';
import { renderNoteHtml, type LinkTarget } from './note-markdown';
import { NoteView } from './note-view';

type Mode = 'view' | 'edit';

/** One note: rendered (view) or in CodeMirror (edit), saved as a plain `.md` file. */
@Component({
  selector: 'app-note-page',
  imports: [Icon, CodeEditor, NoteView, RouterLink, TranslocoPipe],
  templateUrl: './note-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotePage {
  /** Route param `:name`. */
  readonly name = input.required<string>();
  /** Query param `modo`: `editar` opens straight into the editor. */
  readonly modo = input<string | undefined>();

  private readonly api = inject(ASCUA_API);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(NoteStore);
  protected readonly unsaved = inject(UnsavedChanges);
  private readonly injector = inject(Injector);
  private readonly editor = viewChild(CodeEditor);
  private readonly renameInput =
    viewChild<ElementRef<HTMLInputElement>>('renameInput');
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private loadSeq = 0;
  private docSeq = 0;

  protected readonly mode = signal<Mode>('view');
  /** Text as last loaded or saved. */
  protected readonly doc = signal<EditorDoc | undefined>(undefined);
  private readonly version = signal('');
  /** Text the view mode shows: the editor's current text. */
  protected readonly viewText = signal('');
  protected readonly loadError = signal<AscuaError | undefined>(undefined);
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly conflict = signal(false);
  protected readonly saveError = signal<AscuaError | undefined>(undefined);
  protected readonly confirmingDelete = signal(false);
  protected readonly deleteError = signal<AscuaError | undefined>(undefined);
  protected readonly renaming = signal(false);
  protected readonly newName = signal('');
  protected readonly renameTouched = signal(false);
  protected readonly renamePending = signal(false);
  protected readonly renameError = signal<AscuaError | undefined>(undefined);
  /** Renaming was refused because the editor has unsaved changes. */
  protected readonly renameBlocked = signal(false);
  /** Other notes whose links the last rename rewrote. */
  protected readonly renamedCount = signal<number | undefined>(undefined);
  /** The first problem with the typed name, once the user has typed. */
  protected readonly renameProblem = computed<AscuaError | undefined>(() => {
    const code = noteNameError(this.newName().trim());
    if (code) return this.renameTouched() ? { code } : undefined;
    return this.renameError();
  });
  protected readonly pluralKey = pluralKey;
  protected readonly backlinks = computed(() =>
    this.store.backlinks(this.name()),
  );
  /** Route fragment: the heading slug to scroll to. */
  protected readonly fragment = toSignal(this.route.fragment);
  protected readonly html = computed(() => {
    const own = this.name();
    return renderNoteHtml(this.viewText(), (link) => this.resolve(own, link));
  });
  /** The catalog entry of a failure, for `key | transloco: params`. */
  protected readonly errorText = errorText;

  constructor() {
    effect(() => {
      const name = this.name();
      untracked(() => void this.load(name, true));
    });
    effect(() => {
      if (!this.dirty()) untracked(() => this.renameBlocked.set(false));
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.unsaved.prompt() !== undefined) this.unsaved.answer(false);
      this.unsaved.dirty.set(false);
      clearTimeout(this.noticeTimer);
    });
  }

  protected setMode(mode: Mode): void {
    if (mode === 'view') this.viewText.set(this.editorText());
    this.mode.set(mode);
  }

  protected onDirty(dirty: boolean): void {
    this.dirty.set(dirty);
    this.unsaved.dirty.set(dirty);
  }

  /** `initial` picks the mode from the route; a reload keeps the current one. */
  protected async load(name = this.name(), initial = false): Promise<void> {
    const seq = ++this.loadSeq;
    this.doc.set(undefined);
    this.loadError.set(undefined);
    this.saveError.set(undefined);
    this.deleteError.set(undefined);
    this.conflict.set(false);
    this.confirmingDelete.set(false);
    this.cancelRename();
    this.onDirty(false);
    if (initial) this.mode.set(this.modo() === 'editar' ? 'edit' : 'view');
    if (!this.api) {
      this.loadError.set({ code: 'noDesktop' });
      return;
    }
    try {
      const note = await this.api.readNote(name);
      if (seq !== this.loadSeq) return;
      this.version.set(note.version);
      this.viewText.set(note.text);
      this.doc.set({
        path: `${note.name}.md`,
        text: note.text,
        loadId: ++this.docSeq,
      });
    } catch (e) {
      if (seq === this.loadSeq) this.loadError.set(toAscuaError(e));
    }
  }

  /** Saves `text` (the editor's when omitted); `overwrite` skips the version check. */
  protected async save(text?: string, overwrite = false): Promise<void> {
    const doc = this.doc();
    if (!doc || this.saving()) return;
    if (!overwrite && !this.dirty()) return;
    const content = text ?? this.editorText();
    const seq = this.loadSeq;
    this.saving.set(true);
    this.saveError.set(undefined);
    const result = await this.store.save(
      this.name(),
      content,
      overwrite ? undefined : this.version(),
    );
    this.saving.set(false);
    if (seq !== this.loadSeq) return;
    if (!result.ok) {
      this.saveError.set(result.error);
    } else if (result.value.ok) {
      this.conflict.set(false);
      this.version.set(result.value.version);
      this.viewText.set(content);
      this.doc.set({ ...doc, text: content });
      this.onDirty(false);
    } else {
      this.conflict.set(true);
    }
  }

  protected async remove(): Promise<void> {
    const result = await this.store.remove(this.name());
    if (!result.ok) {
      this.confirmingDelete.set(false);
      this.deleteError.set(result.error);
      return;
    }
    this.onDirty(false);
    await this.router.navigate(['/notas']);
  }

  protected startRename(): void {
    this.renamedCount.set(undefined);
    if (this.dirty()) {
      this.renameBlocked.set(true);
      return;
    }
    this.cancelRename();
    this.newName.set(this.name());
    this.renaming.set(true);
    afterNextRender(
      () => {
        const input = this.renameInput()?.nativeElement;
        input?.focus();
        input?.select();
      },
      { injector: this.injector },
    );
  }

  protected cancelRename(): void {
    this.renaming.set(false);
    this.newName.set('');
    this.renameTouched.set(false);
    this.renameError.set(undefined);
    this.renameBlocked.set(false);
  }

  protected onRenameInput(event: Event): void {
    this.newName.set((event.target as HTMLInputElement).value);
    this.renameTouched.set(true);
    this.renameError.set(undefined);
  }

  protected async confirmRename(): Promise<void> {
    if (this.renamePending()) return;
    if (this.dirty()) {
      this.renameBlocked.set(true);
      return;
    }
    this.renameTouched.set(true);
    const next = this.newName().trim();
    if (noteNameError(next)) return;
    const from = this.name();
    if (next === from) {
      this.cancelRename();
      return;
    }
    this.renamePending.set(true);
    const result = await this.store.rename(from, next);
    this.renamePending.set(false);
    if (!result.ok) {
      this.renameError.set(result.error);
      return;
    }
    this.cancelRename();
    const { name, updatedNotes } = result.value;
    clearTimeout(this.noticeTimer);
    if (updatedNotes > 0) {
      this.renamedCount.set(updatedNotes);
      this.noticeTimer = setTimeout(
        () => this.renamedCount.set(undefined),
        4000,
      );
    }
    await this.router.navigate(['/notas', name], {
      replaceUrl: true,
      queryParams: { modo: this.mode() === 'edit' ? 'editar' : null },
    });
  }

  /** Looks a link up in the notes list; `''` is the note being shown. */
  private resolve(own: string, link: WikiLink): LinkTarget {
    const note = this.store.byName(link.note || own);
    if (!note) return { exists: false };
    const target: LinkTarget = { exists: true, note: note.name };
    if (link.heading) {
      const wanted = link.heading.trim().toLowerCase();
      const found = note.headings.find(
        (h) => h.slug === wanted || h.text.trim().toLowerCase() === wanted,
      );
      target.slug = found?.slug ?? headingSlug(link.heading);
    }
    return target;
  }

  protected editorText(): string {
    return this.editor()?.text() ?? this.doc()?.text ?? '';
  }
}
