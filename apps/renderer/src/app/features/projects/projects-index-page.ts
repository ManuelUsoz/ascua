import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProjectStore } from '../../core/projects/project-store';
import { Icon } from '../../shared/icon/icon';

/** Landing screen of Proyectos: nothing selected yet. */
@Component({
  selector: 'app-projects-index-page',
  imports: [RouterLink, TranslocoPipe, Icon],
  templateUrl: './projects-index-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsIndexPage {
  protected readonly store = inject(ProjectStore);
  protected readonly available = this.store.available;
}
