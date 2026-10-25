import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { terminalKey } from '@ascua/ipc';
import type {
  AscuaError,
  Project,
  TerminalOutput,
  TerminalSession,
  TerminalSize,
} from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { toAscuaError } from '../i18n/app-error';

export type TerminalSink = (data: string) => void;

interface Attachment {
  sink: TerminalSink;
  /** Live chunks received before the replay arrived. */
  pending: TerminalOutput[] | undefined;
  /** Chunks with `seq <= floor` are already covered by the replay. */
  floor: number;
}

/**
 * Renderer view of the terminals main runs: statuses as signals and output
 * fan-out to whichever views are mounted.
 */
@Injectable({ providedIn: 'root' })
export class TerminalSessions {
  private readonly api = inject(ASCUA_API);
  private readonly all = signal<Record<string, TerminalSession>>({});
  private readonly attachments = new Map<string, Set<Attachment>>();

  readonly sessions = this.all.asReadonly();
  /** Why the last "+ Terminal" failed; cleared on the next attempt. */
  private readonly shellErrors = signal<Record<string, AscuaError>>({});

  constructor() {
    const api = this.api;
    if (!api) return;

    const offChanged = api.onTerminalChanged((session) => this.upsert(session));
    const offOutput = api.onTerminalOutput((output) => this.dispatch(output));
    const offRemoved = api.onTerminalRemoved((id) => this.delete(id));
    inject(DestroyRef).onDestroy(() => {
      offChanged();
      offOutput();
      offRemoved();
    });
    api
      .listTerminals()
      .then((sessions) => {
        // Events that arrived while listing are newer than the list.
        this.all.update((current) => {
          const next: Record<string, TerminalSession> = {};
          for (const session of sessions) next[session.id] = session;
          return { ...next, ...current };
        });
      })
      .catch(() => undefined);
  }

  session(projectId: string, terminalId: string): TerminalSession | undefined {
    return this.all()[terminalKey(projectId, terminalId)];
  }

  running(projectId: string): TerminalSession[] {
    return Object.values(this.all()).filter(
      (session) =>
        session.projectId === projectId && session.status === 'running',
    );
  }

  shellError(projectId: string): AscuaError | undefined {
    return this.shellErrors()[projectId];
  }

  /** Open ad-hoc shells of a project, in the order they were opened. */
  shells(projectId: string): TerminalSession[] {
    return Object.values(this.all()).filter(
      (session) => session.projectId === projectId && session.kind === 'shell',
    );
  }

  /** Running and total terminals: saved pistas plus open shells. */
  counts(project: Project): { running: number; total: number } {
    const shells = this.shells(project.id);
    const running =
      project.terminals.filter(
        (spec) => this.session(project.id, spec.id)?.status === 'running',
      ).length + shells.filter((s) => s.status === 'running').length;
    return { running, total: project.terminals.length + shells.length };
  }

  async openShell(
    projectId: string,
    size?: TerminalSize,
  ): Promise<TerminalSession | undefined> {
    if (!this.api) return undefined;
    this.setShellError(projectId, undefined);
    try {
      const session = await this.api.openShell(projectId, size);
      this.upsert(session);
      if (session.status === 'failed') {
        this.setShellError(
          projectId,
          session.error ?? { code: 'terminal.openFailed' },
        );
      }
      return session;
    } catch (e) {
      this.setShellError(projectId, toAscuaError(e));
      return undefined;
    }
  }

  private setShellError(
    projectId: string,
    error: AscuaError | undefined,
  ): void {
    this.shellErrors.update((current) => {
      const next = { ...current };
      if (error === undefined) delete next[projectId];
      else next[projectId] = error;
      return next;
    });
  }

  async close(projectId: string, terminalId: string): Promise<void> {
    if (!this.api) return;
    await this.api.closeShell(projectId, terminalId);
    this.delete(terminalKey(projectId, terminalId));
  }

  async attach(id: string, sink: TerminalSink): Promise<() => void> {
    const api = this.api;
    if (!api) return () => undefined;

    const attachment: Attachment = { sink, pending: [], floor: 0 };
    let set = this.attachments.get(id);
    if (!set) this.attachments.set(id, (set = new Set()));
    set.add(attachment);
    const detach = (): void => {
      const current = this.attachments.get(id);
      current?.delete(attachment);
      if (current?.size === 0) this.attachments.delete(id);
    };

    try {
      const replay = await api.replayTerminal(id);
      if (!set.has(attachment)) return detach;
      attachment.floor = replay.seq;
      if (replay.data) sink(replay.data);
      const pending = attachment.pending ?? [];
      attachment.pending = undefined;
      for (const output of pending) {
        if (output.seq > attachment.floor) sink(output.data);
      }
    } catch {
      attachment.pending = undefined;
    }
    return detach;
  }

  async start(
    projectId: string,
    terminalId: string,
    size?: TerminalSize,
  ): Promise<void> {
    if (!this.api) return;
    this.upsert(await this.api.startTerminal(projectId, terminalId, size));
  }

  async stop(projectId: string, terminalId: string): Promise<void> {
    await this.api?.stopTerminal(projectId, terminalId);
  }

  async startAll(project: Project): Promise<void> {
    await Promise.all(
      project.terminals
        .filter(
          (spec) => this.session(project.id, spec.id)?.status !== 'running',
        )
        .map((spec) => this.start(project.id, spec.id)),
    );
  }

  async stopAll(project: Project): Promise<void> {
    await Promise.all(
      this.running(project.id).map((session) =>
        this.stop(session.projectId, session.terminalId),
      ),
    );
  }

  write(id: string, data: string): void {
    this.api?.writeTerminal(id, data);
  }

  resize(id: string, size: TerminalSize): void {
    this.api?.resizeTerminal(id, size);
  }

  /** Track a session opened outside this service (e.g. a login terminal). */
  adopt(session: TerminalSession): void {
    this.upsert(session);
  }

  private upsert(session: TerminalSession): void {
    this.all.update((current) => ({ ...current, [session.id]: session }));
  }

  private delete(id: string): void {
    this.all.update((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  private dispatch(output: TerminalOutput): void {
    const set = this.attachments.get(output.id);
    if (!set) return;
    for (const attachment of set) {
      if (attachment.pending) attachment.pending.push(output);
      else if (output.seq > attachment.floor) attachment.sink(output.data);
    }
  }
}
