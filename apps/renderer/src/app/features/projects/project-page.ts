import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  effect,
  input,
  untracked,
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
import { IndexStore } from '../../core/projects/index-store';
import { TerminalSessions } from '../../core/terminals/terminal-sessions';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { ProgressBar } from '../../shared/progress/progress-bar';
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
    Button,
    PistaForm,
    ProgressBar,
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
  protected readonly indexing = inject(IndexStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly project = computed(() =>
    this.store.byId(this.projectId()),
  );
  /** Id of the opened project once it exists; unchanged by edits to other fields. */
  private readonly indexTarget = computed(() =>
    this.project() ? this.projectId() : undefined,
  );
  protected readonly index = computed(() =>
    this.indexing.progress(this.projectId()),
  );
  protected readonly indexError = computed(() => {
    const error = this.index()?.error;
    return error ? errorText(error) : undefined;
  });

  constructor() {
    effect(() => {
      const id = this.indexTarget();
      if (id) untracked(() => void this.indexing.start(id));
    });
    effect(() =>
      console.log('[index] page reads', {
        projectId: this.projectId(),
        index: this.index(),
      }),
    );
  }
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
