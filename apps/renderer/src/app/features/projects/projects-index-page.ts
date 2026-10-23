import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { ProjectStore } from '../../core/projects/project-store';
import { Icon } from '../../shared/icon/icon';

/** Landing screen of Proyectos: nothing selected yet. */
@Component({
  selector: 'app-projects-index-page',
  imports: [RouterLink, Icon],
  templateUrl: './projects-index-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsIndexPage {
  protected readonly store = inject(ProjectStore);
  protected readonly available = inject(ASCUA_API) !== undefined;
}
