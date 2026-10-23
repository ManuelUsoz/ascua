import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProjectStore } from '../../core/projects/project-store';
import { TerminalSessions } from '../../core/terminals/terminal-sessions';
import { Icon } from '../../shared/icon/icon';
import { PistaEditor } from './pista-editor';
import { TerminalPane } from './terminal-pane';

/** The project's terminals grid: saved pistas first, then the open ad-hoc shells. */
@Component({
  selector: 'app-terminals-page',
  imports: [TerminalPane, TranslocoPipe, Icon],
  templateUrl: './terminals-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TerminalsPage {
  readonly projectId = input.required<string>();

  protected readonly editor = inject(PistaEditor);
  protected readonly sessions = inject(TerminalSessions);
  private readonly store = inject(ProjectStore);
  protected readonly project = computed(() =>
    this.store.byId(this.projectId()),
  );
  protected readonly shells = computed(() =>
    this.sessions.shells(this.projectId()),
  );
  protected readonly count = computed(
    () => (this.project()?.terminals.length ?? 0) + this.shells().length,
  );
}
