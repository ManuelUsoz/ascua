import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { noteKey } from '@ascua/notes';
import { filter, map } from 'rxjs';
import { NoteStore } from '../../../core/notes/note-store';
import { Icon } from '../../../shared/icon/icon';

/** The note named by a `/notas/<name>` URL, if any. */
function activeNoteName(url: string): string | undefined {
  const path = url.split(/[?#]/)[0] ?? '';
  const match = /^\/notas\/([^/]+)/.exec(path);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/**
 * Side slot of Mis notas: every note, with the open one expanded into its
 * headings. Its keys use the `notes.` scope, loaded by the active route.
 */
@Component({
  selector: 'app-notes-side',
  imports: [RouterLink, Icon, TranslocoPipe],
  templateUrl: './notes-side.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesSide {
  protected readonly store = inject(NoteStore);
  private readonly router = inject(Router);
  private readonly activeName = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => activeNoteName(this.router.url)),
    ),
    { initialValue: activeNoteName(this.router.url) },
  );

  protected readonly activeKey = computed(() => {
    const name = this.activeName();
    return name === undefined ? undefined : noteKey(name);
  });

  protected isActive(name: string): boolean {
    return this.activeKey() === noteKey(name);
  }
}
