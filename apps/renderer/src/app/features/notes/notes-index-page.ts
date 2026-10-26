import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { AscuaError } from '@ascua/ipc';
import { noteNameError } from '@ascua/notes';
import { TranslocoPipe } from '@jsverse/transloco';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { errorText, toAscuaError } from '../../core/i18n/app-error';
import { NoteStore } from '../../core/notes/note-store';
import { Icon } from '../../shared/icon/icon';

/** Landing screen of Mis notas: create a note or open the folder. */
@Component({
  selector: 'app-notes-index-page',
  imports: [TranslocoPipe, Icon],
  templateUrl: './notes-index-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesIndexPage {
  protected readonly store = inject(NoteStore);
  private readonly api = inject(ASCUA_API);
  private readonly router = inject(Router);

  protected readonly available = this.store.available;
  protected readonly name = signal('');
  protected readonly touched = signal(false);
  protected readonly failure = signal<AscuaError | undefined>(undefined);
  protected readonly errorText = errorText;

  /** The first problem with the typed name, once the user has typed. */
  protected readonly problem = computed<AscuaError | undefined>(() => {
    const code = noteNameError(this.name());
    if (code) return this.touched() ? { code } : undefined;
    return this.failure();
  });

  protected onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
    this.touched.set(true);
    this.failure.set(undefined);
  }

  protected async create(): Promise<void> {
    this.touched.set(true);
    const name = this.name().trim();
    if (noteNameError(name)) return;
    const result = await this.store.create(name);
    if (!result.ok) {
      this.failure.set(result.error);
      return;
    }
    await this.router.navigate(['/notas', result.value.name], {
      queryParams: { modo: 'editar' },
    });
  }

  protected async openFolder(): Promise<void> {
    if (!this.api) return;
    try {
      this.failure.set(await this.api.revealNotes());
    } catch (e) {
      this.failure.set(toAscuaError(e));
    }
  }
}
