import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProjectStore } from '../../core/projects/project-store';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';

/** Landing screen of Proyectos: nothing selected yet. */
@Component({
  selector: 'app-projects-index-page',
  imports: [RouterLink, TranslocoPipe, Icon, Button],
  templateUrl: './projects-index-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsIndexPage {
  protected readonly store = inject(ProjectStore);
  protected readonly available = this.store.available;
  private readonly router = inject(Router);
  private redirected = false;

  constructor() {
    // Preselect the first project (matches main's startup warm-up).
    effect(() => {
      if (!this.store.loaded() || this.redirected) return;
      const first = this.store.projects()[0];
      if (!first) return;
      this.redirected = true;
      if (!this.store.claimInitialSelection()) return;
      untracked(() => {
        void this.router.navigate(['/proyectos', first.id], {
          replaceUrl: true,
        });
      });
    });
  }
}
