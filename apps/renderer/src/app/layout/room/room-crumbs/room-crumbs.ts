import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { Breadcrumb, CrumbItem } from '../../../shared/breadcrumb/breadcrumb';
import { ProjectStore } from '../../../core/projects/project-store';
import { RepositorySelection } from '../../../core/source-control/repository-selection';
import { injectCrumbs } from '../crumbs';

/** Where the room is, shown first in the main column above the screen. */
@Component({
  selector: 'app-room-crumbs',
  imports: [Breadcrumb],
  templateUrl: './room-crumbs.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomCrumbs {
  private readonly projects = inject(ProjectStore);
  private readonly selection = inject(RepositorySelection);
  private readonly transloco = inject(TranslocoService);
  private readonly crumbs = injectCrumbs();
  private readonly lang = toSignal(this.transloco.langChanges$);

  private readonly project = computed(() =>
    this.projects.byId(this.crumbs().projectId),
  );

  protected readonly items = computed<CrumbItem[]>(() => {
    this.lang();
    const crumbs = this.crumbs();
    const pr = this.selection.selectedPr();
    if (crumbs.side === 'repositories' && pr) {
      return [
        {
          label: this.transloco.translate<string>('nav.repositories'),
          go: () => this.selection.back(),
        },
        { label: pr.sourceBranch, mono: true },
      ];
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
