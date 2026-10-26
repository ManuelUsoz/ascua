import { Injectable, inject, signal } from '@angular/core';
import type {
  AscuaApi,
  AscuaError,
  NoteContent,
  NoteRenameResult,
  NoteSummary,
  SaveFileResult,
} from '@ascua/ipc';
import { noteKey } from '@ascua/notes';
import { ASCUA_API } from '../bridge/ascua-api';
import { toAscuaError } from '../i18n/app-error';

const NO_DESKTOP: AscuaError = { code: 'noDesktop' };

export type NoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AscuaError };

/** The notes stored by main. Empty in the browser preview. */
@Injectable({ providedIn: 'root' })
export class NoteStore {
  private readonly api = inject(ASCUA_API);
  private readonly list = signal<NoteSummary[]>([]);
  private readonly ready = signal(false);

  /** The desktop bridge is present (false in the browser preview). */
  readonly available = this.api !== undefined;
  readonly notes = this.list.asReadonly();
  readonly loaded = this.ready.asReadonly();

  constructor() {
    void this.reload();
  }

  byName(name: string | undefined): NoteSummary | undefined {
    if (name === undefined) return undefined;
    const key = noteKey(name);
    return this.list().find((note) => noteKey(note.name) === key);
  }

  /** Notes (other than `name`) whose links point at `name`. */
  backlinks(name: string): NoteSummary[] {
    const key = noteKey(name);
    return this.list().filter(
      (note) =>
        noteKey(note.name) !== key &&
        note.links.some((link) => noteKey(link) === key),
    );
  }

  async reload(): Promise<void> {
    const api = this.api;
    if (!api) {
      this.ready.set(true);
      return;
    }
    try {
      this.list.set(await api.listNotes());
    } catch {
      // Keep whatever we had; the list stays usable.
    }
    this.ready.set(true);
  }

  create(name: string, text?: string): Promise<NoteResult<NoteContent>> {
    return this.run((api) => api.createNote(name, text));
  }

  save(
    name: string,
    text: string,
    version?: string,
  ): Promise<NoteResult<SaveFileResult>> {
    return this.run((api) => api.saveNote(name, text, version));
  }

  remove(name: string): Promise<NoteResult<void>> {
    return this.run((api) => api.deleteNote(name));
  }

  rename(from: string, to: string): Promise<NoteResult<NoteRenameResult>> {
    return this.run((api) => api.renameNote(from, to));
  }

  private async run<T>(
    call: (api: AscuaApi) => Promise<T>,
  ): Promise<NoteResult<T>> {
    const api = this.api;
    if (!api) return { ok: false, error: NO_DESKTOP };
    try {
      const value = await call(api);
      await this.reload();
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: toAscuaError(e) };
    }
  }
}
