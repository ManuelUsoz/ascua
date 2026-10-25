import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../../core/chats/chat-store';
import { ProjectStore } from '../../../core/projects/project-store';
import { TerminalSessions } from '../../../core/terminals/terminal-sessions';
import { Button } from '../../../shared/button/button';
import { Icon } from '../../../shared/icon/icon';
import { injectCrumbs } from '../crumbs';

/** Project tree: every project, with the current one expanded. */
@Component({
  selector: 'app-project-side',
  imports: [RouterLink, RouterLinkActive, Button, Icon, TranslocoPipe],
  templateUrl: './project-side.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSide {
  protected readonly store = inject(ProjectStore);
  protected readonly sessions = inject(TerminalSessions);
  protected readonly chats = inject(ChatStore);
  protected readonly crumbs = injectCrumbs();

  constructor() {
    effect(() => {
      const id = this.crumbs().projectId;
      if (id) untracked(() => this.chats.ensureLoaded(id));
    });
  }

  protected tone(projectId: string, terminalId: string): string | null {
    const status = this.sessions.session(projectId, terminalId)?.status;
    if (status === 'running') return 'ok';
    return status === 'failed' ? 'alert' : null;
  }

  protected chatTone(sessionId: string): string | null {
    const status = this.chats.status(sessionId);
    if (status === 'running') return 'ok';
    if (status === 'awaitingPermission') return 'ask';
    return status === 'failed' ? 'alert' : null;
  }
}
