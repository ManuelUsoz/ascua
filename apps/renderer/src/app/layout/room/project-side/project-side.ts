import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectStore } from '../../../core/projects/project-store';
import { TerminalSessions } from '../../../core/terminals/terminal-sessions';
import { Icon } from '../../../shared/icon/icon';
import { injectCrumbs } from '../crumbs';

/** Project tree: every project, with the current one expanded. */
@Component({
  selector: 'app-project-side',
  imports: [RouterLink, Icon],
  templateUrl: './project-side.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSide {
  protected readonly store = inject(ProjectStore);
  protected readonly sessions = inject(TerminalSessions);
  protected readonly crumbs = injectCrumbs();

  protected tone(projectId: string, terminalId: string): string | null {
    const status = this.sessions.session(projectId, terminalId)?.status;
    if (status === 'running') return 'ok';
    return status === 'failed' ? 'alert' : null;
  }
}
