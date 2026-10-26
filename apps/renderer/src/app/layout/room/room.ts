import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { ProjectStore } from '../../core/projects/project-store';
import { RoomState } from '../../core/room/room-state';
import { Breadcrumb, CrumbItem } from '../../shared/breadcrumb/breadcrumb';
import { RepositorySelection } from '../../core/source-control/repository-selection';
import { repositoryItems } from '../../features/repositories/repository-crumbs';
import { injectCrumbs } from './crumbs';
import { ProjectSide } from './project-side/project-side';
import { Rail } from './rail/rail';
import { RepositorySide } from './repository-side/repository-side';
import { RoomBar } from './room-bar/room-bar';

/**
 * The room that blooms out of the avatar: the fullscreen state of the same
 * window, never a second one. Feature screens render in its outlet.
 */
@Component({
  selector: 'app-room',
  imports: [
    RouterOutlet,
    RoomBar,
    Breadcrumb,
    Rail,
    ProjectSide,
    RepositorySide,
  ],
  templateUrl: './room.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Room {
  protected readonly room = inject(RoomState);
  protected readonly crumbs = injectCrumbs();
  private readonly projects = inject(ProjectStore);
  private readonly selection = inject(RepositorySelection);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$);

  private readonly project = computed(() =>
    this.projects.byId(this.crumbs().projectId),
  );

  protected readonly items = computed<CrumbItem[]>(() => {
    this.lang();
    const crumbs = this.crumbs();
    if (crumbs.side === 'repositories') {
      const screen = repositoryItems(
        {
          repo: this.selection.selectedRepo(),
          pr: this.selection.selectedPr(),
          commit: this.selection.selectedCommit(),
        },
        this.transloco.translate<string>('nav.repositories'),
        (commands) => void this.router.navigate([...commands]),
      );
      if (screen) return screen;
    }
    const root =
      this.project()?.name ??
      this.transloco.translate<string>(crumbs.area ?? 'nav.projects');
    const items: CrumbItem[] = [{ label: root }];
    if (crumbs.section) {
      items.push({ label: this.transloco.translate<string>(crumbs.section) });
    }
    return items;
  });
}
