import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { terminalKey, type TerminalSpec } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { TerminalSessions } from '../../core/terminals/terminal-sessions';
import { Icon } from '../../shared/icon/icon';
import { PistaEditor } from './pista-editor';
import { terminalStateView } from './terminal-state';
import { TerminalView } from './terminal-view';

/** A terminal card: a saved pista (`spec` set) or an ad-hoc shell. */
@Component({
  selector: 'app-terminal-pane',
  imports: [TranslocoPipe, Icon, TerminalView],
  templateUrl: './terminal-pane.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class TerminalPane {
  readonly projectId = input.required<string>();
  readonly terminalId = input.required<string>();
  readonly name = input.required<string>();
  readonly spec = input<TerminalSpec>();

  private readonly sessions = inject(TerminalSessions);
  protected readonly editor = inject(PistaEditor);

  protected readonly key = computed(() =>
    terminalKey(this.projectId(), this.terminalId()),
  );
  protected readonly session = computed(() =>
    this.sessions.session(this.projectId(), this.terminalId()),
  );
  protected readonly running = computed(
    () => this.session()?.status === 'running',
  );
  protected readonly state = computed(() => terminalStateView(this.session()));

  protected toggle(): void {
    if (this.running())
      void this.sessions.stop(this.projectId(), this.terminalId());
    else void this.sessions.start(this.projectId(), this.terminalId());
  }

  protected close(): void {
    void this.sessions.close(this.projectId(), this.terminalId());
  }
}
