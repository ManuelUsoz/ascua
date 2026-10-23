import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import type { FileContent, FileEntry } from '@ascua/ipc';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { errorMessage } from '../../core/bridge/error-message';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { filterIndex, visibleRows } from './file-tree-model';

export type DirState = readonly FileEntry[] | 'loading' | { error: string };
/** Why there is no editable text: binary, too large or a failed read. */
export type ViewContent = Exclude<FileContent, { kind: 'text' }> | { error: string };

const NO_API = 'Esto solo funciona en la app de escritorio.';
const message = errorMessage;

/**
 * State of the Archivos tab for one project: lazy tree, filter index and the
 * open file. Provided by FilesPage, so leaving and re-entering the tab creates
 * a fresh instance and therefore a fresh tree and index.
 */
@Injectable()
export class FileBrowser {
  private readonly api = inject(ASCUA_API);
  private projectId = '';
  private indexLoading = false;
  /** Bumped per project/file so a slow answer for a previous one is dropped. */
  private epoch = 0;
  private fileSeq = 0;
  private loadSeq = 0;
  private readonly unsaved = inject(UnsavedChanges);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.unsaved.prompt() !== undefined) this.unsaved.answer(false);
      this.unsaved.dirty.set(false);
    });
  }

  readonly dirs = signal<Readonly<Record<string, DirState>>>({});
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly selected = signal<string | undefined>(undefined);
  readonly content = signal<ViewContent | undefined>(undefined);
  readonly index = signal<{ files: string[]; truncated: boolean } | undefined>(undefined);
  readonly query = signal('');
  readonly indexError = signal<string | undefined>(undefined);
  readonly openError = signal<string | undefined>(undefined);
  /** Text as last loaded or saved; `loadId` changes on load/reload, not on save. */
  readonly baseline = signal<
    | {
        path: string;
        text: string;
        version: string;
        loadId: number;
        editable: boolean;
        openable: boolean;
      }
    | undefined
  >(undefined);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly conflict = signal(false);
  readonly saveError = signal<string | undefined>(undefined);

  readonly root = computed(() => this.dirs()[''] ?? 'loading');
  readonly rows = computed(() => {
    const loaded = new Map<string, readonly FileEntry[]>();
    for (const [dir, state] of Object.entries(this.dirs())) {
      if (Array.isArray(state)) loaded.set(dir, state as readonly FileEntry[]);
    }
    return visibleRows(loaded, this.expanded());
  });
  readonly results = computed(() => {
    const index = this.index();
    return index ? filterIndex(index.files, this.query()) : [];
  });

  load(projectId: string): void {
    if (projectId === this.projectId) return;
    this.projectId = projectId;
    this.epoch++;
    this.indexLoading = false;
    this.dirs.set({});
    this.expanded.set(new Set());
    this.selected.set(undefined);
    this.content.set(undefined);
    this.baseline.set(undefined);
    this.fileSeq++;
    this.conflict.set(false);
    this.saveError.set(undefined);
    this.setDirty(false);
    this.index.set(undefined);
    this.query.set('');
    this.indexError.set(undefined);
    this.openError.set(undefined);
    void this.loadDir('');
  }

  toggle(dir: string): void {
    const next = new Set(this.expanded());
    if (next.has(dir)) {
      next.delete(dir);
    } else {
      next.add(dir);
      if (!Array.isArray(this.dirs()[dir])) void this.loadDir(dir);
    }
    this.expanded.set(next);
  }

  async open(path: string, opts: { force?: boolean } = {}): Promise<void> {
    if (!opts.force) {
      const same = path === this.selected();
      // A loaded file stays as is; a failed or non-text one retries on click.
      if (same && this.baseline()) return;
      if (!same && !(await this.unsaved.confirmDiscard(this.selected() ?? ''))) return;
    }
    const seq = ++this.fileSeq;
    this.setDirty(false);
    this.selected.set(path);
    this.openError.set(undefined);
    this.conflict.set(false);
    this.saveError.set(undefined);
    this.baseline.set(undefined);
    this.content.set(undefined);
    if (!this.api) return this.content.set({ error: NO_API });
    const epoch = this.epoch;
    let content: FileContent | { error: string };
    try {
      content = await this.api.readFile(this.projectId, path);
    } catch (e) {
      content = { error: message(e) };
    }
    if (seq !== this.fileSeq || epoch !== this.epoch) return;
    if ('error' in content) this.content.set(content);
    else if (content.kind === 'text') {
      this.baseline.set({
        path,
        text: content.text,
        version: content.version,
        loadId: ++this.loadSeq,
        editable: content.editable,
        openable: content.openable,
      });
    } else this.content.set(content);
  }

  reload(): Promise<void> {
    const path = this.selected();
    return path ? this.open(path, { force: true }) : Promise.resolve();
  }

  setDirty(dirty: boolean): void {
    this.dirty.set(dirty);
    this.unsaved.dirty.set(dirty);
  }

  /** Saves `text`; `overwrite` skips the on-disk version check. */
  async save(text: string, overwrite = false): Promise<void> {
    const base = this.baseline();
    if (!base || !base.editable || !this.api || this.saving()) return;
    if (!overwrite && !this.dirty()) return;
    const seq = this.fileSeq;
    const epoch = this.epoch;
    this.saving.set(true);
    this.saveError.set(undefined);
    try {
      const result = await this.api.writeFile(
        this.projectId,
        base.path,
        text,
        overwrite ? undefined : base.version,
      );
      if (seq !== this.fileSeq || epoch !== this.epoch) return;
      if (result.ok) {
        this.conflict.set(false);
        this.baseline.set({ ...base, text, version: result.version });
        this.setDirty(false);
      } else {
        this.conflict.set(true);
      }
    } catch (e) {
      if (seq === this.fileSeq && epoch === this.epoch) this.saveError.set(message(e));
    } finally {
      this.saving.set(false);
    }
  }

  async openInEditor(): Promise<void> {
    const path = this.selected();
    if (!path || !this.api) return;
    try {
      this.openError.set((await this.api.openFile(this.projectId, path)) || undefined);
    } catch (e) {
      this.openError.set(message(e));
    }
  }

  async reveal(): Promise<void> {
    const path = this.selected();
    if (!path || !this.api) return;
    try {
      this.openError.set((await this.api.revealFile(this.projectId, path)) || undefined);
    } catch (e) {
      this.openError.set(message(e));
    }
  }

  /** Called on the first focus of the filter box. */
  async ensureIndex(): Promise<void> {
    if (this.index() || this.indexLoading || !this.api) return;
    this.indexLoading = true;
    this.indexError.set(undefined);
    const epoch = this.epoch;
    try {
      const index = await this.api.fileIndex(this.projectId);
      if (epoch === this.epoch) this.index.set(index);
      if (epoch === this.epoch) this.indexError.set(undefined);
    } catch (e) {
      // Leave `index` undefined so the next filter focus retries.
      if (epoch === this.epoch) this.indexError.set(message(e));
    } finally {
      if (epoch === this.epoch) this.indexLoading = false;
    }
  }

  private async loadDir(dir: string): Promise<void> {
    const epoch = this.epoch;
    const put = (state: DirState) => {
      if (epoch === this.epoch) this.dirs.update((d) => ({ ...d, [dir]: state }));
    };
    if (!this.api) return put({ error: NO_API });
    put('loading');
    try {
      put(await this.api.listDir(this.projectId, dir));
    } catch (e) {
      put({ error: message(e) });
    }
  }
}
