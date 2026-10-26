import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { ChatSession } from '@ascua/chat';
import {
  ContextMenu,
  type ContextMenuItem,
} from '../../../shared/context-menu/context-menu';
import { ConfirmModal } from '../../../shared/modal/modal';
import { ChatStore } from '../../../core/chats/chat-store';
import { ProjectStore } from '../../../core/projects/project-store';
import { TerminalSessions } from '../../../core/terminals/terminal-sessions';
import { Button } from '../../../shared/button/button';
import { Icon } from '../../../shared/icon/icon';
import { injectCrumbs } from '../crumbs';

/** Project tree: every project, with the current one expanded. */
@Component({
  selector: 'app-project-side',
  imports: [
    RouterLink,
    RouterLinkActive,
    Button,
    Icon,
    TranslocoPipe,
    ContextMenu,
    ConfirmModal,
  ],
  templateUrl: './project-side.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSide {
  protected readonly store = inject(ProjectStore);
  protected readonly sessions = inject(TerminalSessions);
  protected readonly chats = inject(ChatStore);
  protected readonly crumbs = injectCrumbs();
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

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

  protected readonly pending = signal<{
    projectId: string;
    sessionId: string;
    name: string;
  } | null>(null);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly chatMenu = viewChild.required(ContextMenu);
  private target: { projectId: string; chat: ChatSession } | null = null;
  /** Static so `openAt` sees them at once; `run` reads the last target. */
  protected readonly menuItems: ContextMenuItem[] = [
    {
      icon: 'trash',
      label: 'common.delete',
      tone: 'danger',
      run: () => {
        if (this.target)
          this.askDelete(this.target.projectId, this.target.chat);
      },
    },
  ];

  protected onChatKey(
    event: KeyboardEvent,
    projectId: string,
    c: ChatSession,
  ): void {
    if (
      event.key === 'ContextMenu' ||
      (event.shiftKey && event.key === 'F10')
    ) {
      this.openChatMenu(event, projectId, c);
    }
  }

  protected openChatMenu(
    event: Event,
    projectId: string,
    c: ChatSession,
  ): void {
    event.preventDefault();
    let x: number;
    let y: number;
    if (event instanceof MouseEvent) {
      x = event.clientX;
      y = event.clientY;
    } else {
      const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
      x = r.left;
      y = r.bottom;
    }
    this.target = { projectId, chat: c };
    this.chatMenu().openAt(x, y);
  }

  protected askDelete(projectId: string, c: ChatSession): void {
    this.deleteError.set(null);
    this.pending.set({
      projectId,
      sessionId: c.id,
      name: c.title || this.transloco.translate('side.untitledChat'),
    });
  }

  protected async confirmDelete(): Promise<void> {
    const p = this.pending();
    if (!p) return;
    this.pending.set(null);
    const err = await this.chats.remove(p.projectId, p.sessionId);
    if (err) {
      this.deleteError.set(err.code);
      return;
    }
    const open = `/proyectos/${p.projectId}/chats/${p.sessionId}`;
    if (this.router.url.split('?')[0] === open) {
      await this.router.navigate(['/proyectos', p.projectId, 'chats', 'nuevo']);
    }
  }

  protected chatTone(sessionId: string): string | null {
    const status = this.chats.status(sessionId);
    if (status === 'running') return 'ok';
    if (status === 'awaitingPermission') return 'ask';
    return status === 'failed' ? 'alert' : null;
  }
}
