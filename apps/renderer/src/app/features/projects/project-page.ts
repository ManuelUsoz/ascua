import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import type { AscuaError } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorText } from '../../core/i18n/app-error';
import type { Text } from '../../core/i18n/text';
import { ProjectStore } from '../../core/projects/project-store';
import { TerminalSessions } from '../../core/terminals/terminal-sessions';
import { Icon } from '../../shared/icon/icon';
import { PistaEditor } from '../terminals/pista-editor';
import { PistaForm } from '../terminals/pista-form';

/** Header, actions and tabs of one project; the tab content is the outlet. */
@Component({
  selector: 'app-project-page',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoPipe,
    Icon,
    PistaForm,
  ],
  templateUrl: './project-page.html',
  providers: [PistaEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectPage {
  readonly projectId = input.required<string>();

  protected readonly store = inject(ProjectStore);
  protected readonly sessions = inject(TerminalSessions);
  protected readonly editor = inject(PistaEditor);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly project = computed(() =>
    this.store.byId(this.projectId()),
  );
  protected readonly counts = computed(() => {
    const project = this.project();
    return project ? this.sessions.counts(project) : { running: 0, total: 0 };
  });

  /** The reason behind a failed shell, unless the error is the generic one itself. */
  protected shellDetail(error: AscuaError): Text | undefined {
    return error.code === 'terminal.openFailed' ? undefined : errorText(error);
  }

  protected async openShell(): Promise<void> {
    if (!(await this.sessions.openShell(this.projectId()))) return;
    await this.router.navigate(['terminales'], { relativeTo: this.route });
  }
}
