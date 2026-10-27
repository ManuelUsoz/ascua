import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { IPC, terminalKey } from '@ascua/ipc';
import type {
  AscuaError,
  Project,
  TerminalKind,
  TerminalReplay,
  TerminalSession,
  TerminalSize,
} from '@ascua/ipc';
import type { ProjectListener } from '../projects/project-ipc';
import type { ProjectRepository } from '../projects/project-repository';
import type { HostEvent } from './host/pty-protocol';
import type { PtyBackend } from './pty-backend';
import { shellCommand } from './shell';
import type { Shell } from './shell';

type Session = TerminalSession & { stopping: boolean };

const DEFAULT_SIZE: TerminalSize = { cols: 120, rows: 30 };
const STOP_TIMEOUT_MS = 3000;

export class TerminalManager implements ProjectListener {
  private readonly sessions = new Map<string, Session>();
  private readonly exitWaiters = new Set<() => void>();
  private readonly exitListeners = new Map<string, Array<() => void>>();
  private readonly commands = new Map<
    string,
    { file: string; args: string[] }
  >();
  private shellSeq = 0;

  constructor(
    private readonly repository: ProjectRepository,
    private readonly backend: PtyBackend,
    private readonly notify: (channel: string, payload: unknown) => void,
    private readonly shell: Shell,
    private readonly exists: (path: string) => boolean = existsSync,
  ) {
    backend.onEvent((event) => this.onHostEvent(event));
  }

  async start(
    projectId: string,
    terminalId: string,
    size: TerminalSize = DEFAULT_SIZE,
  ): Promise<TerminalSession> {
    const id = terminalKey(projectId, terminalId);
    const current = this.sessions.get(id);
    if (current?.status === 'running') return this.view(current);

    const project = await this.repository.get(projectId);
    if (!project) {
      return this.fail(
        id,
        projectId,
        terminalId,
        { code: 'project.notFound' },
        current ? { kind: current.kind, name: current.name } : undefined,
      );
    }

    if (current?.kind === 'shell') {
      // Reopen an exited ad-hoc shell in place, at the project root.
      if (!this.exists(project.path)) {
        return this.fail(
          id,
          projectId,
          terminalId,
          { code: 'terminal.folderMissing', params: { path: project.path } },
          { kind: 'shell', name: current.name },
        );
      }
      return this.spawn(
        {
          ...current,
          status: 'running',
          exitCode: undefined,
          error: undefined,
          stopping: false,
        },
        project.path,
        this.commands.get(id),
        size,
      );
    }

    const spec = project.terminals.find((t) => t.id === terminalId);
    if (!spec) {
      return this.fail(id, projectId, terminalId, {
        code: 'terminal.notFound',
      });
    }

    const cwd = resolve(project.path, spec.cwd ?? '.');
    if (!this.exists(cwd)) {
      return this.fail(id, projectId, terminalId, {
        code: 'terminal.folderMissing',
        params: { path: cwd },
      });
    }

    return this.spawn(
      {
        id,
        projectId,
        terminalId,
        kind: 'pista',
        status: 'running',
        stopping: false,
      },
      cwd,
      spec.command,
      size,
    );
  }

  /** Open an ad-hoc shell at the project root. */
  async openShell(
    projectId: string,
    size: TerminalSize = DEFAULT_SIZE,
  ): Promise<TerminalSession> {
    const terminalId = `shell-${++this.shellSeq}`;
    const id = terminalKey(projectId, terminalId);
    const project = await this.repository.get(projectId);
    if (!project) {
      // Nothing to track: a phantom session would outlive the missing project.
      return this.view({
        id,
        projectId,
        terminalId,
        kind: 'shell',
        name: 'shell',
        status: 'failed',
        error: { code: 'project.notFound' },
        stopping: false,
      });
    }

    const taken = new Set<string | undefined>();
    for (const s of this.sessions.values()) {
      if (s.projectId === projectId && s.kind === 'shell') taken.add(s.name);
    }
    let n = 1;
    while (taken.has(n === 1 ? 'shell' : `shell ${n}`)) n++;
    const name = n === 1 ? 'shell' : `shell ${n}`;

    if (!this.exists(project.path)) {
      return this.fail(
        id,
        projectId,
        terminalId,
        { code: 'terminal.folderMissing', params: { path: project.path } },
        { kind: 'shell', name },
      );
    }
    return this.spawn(
      {
        id,
        projectId,
        terminalId,
        kind: 'shell',
        name,
        status: 'running',
        stopping: false,
      },
      project.path,
      undefined,
      size,
    );
  }

  /** Closable shell-kind session that spawns the argv directly (no quoting). */
  async openCommand(
    projectId: string,
    command: { name: string; file: string; args: string[] },
    size: TerminalSize = DEFAULT_SIZE,
  ): Promise<TerminalSession> {
    const terminalId = `shell-${++this.shellSeq}`;
    const id = terminalKey(projectId, terminalId);
    const project = await this.repository.get(projectId);
    if (!project) {
      return this.view({
        id,
        projectId,
        terminalId,
        kind: 'shell',
        name: command.name,
        status: 'failed',
        error: { code: 'project.notFound' },
        stopping: false,
      });
    }
    if (!this.exists(project.path)) {
      return this.fail(
        id,
        projectId,
        terminalId,
        { code: 'terminal.folderMissing', params: { path: project.path } },
        { kind: 'shell', name: command.name },
      );
    }
    const argv = { file: command.file, args: command.args };
    this.commands.set(id, argv);
    return this.spawn(
      {
        id,
        projectId,
        terminalId,
        kind: 'shell',
        name: command.name,
        status: 'running',
        stopping: false,
      },
      project.path,
      argv,
      size,
    );
  }

  closeShell(projectId: string, terminalId: string): void {
    const session = this.sessions.get(terminalKey(projectId, terminalId));
    if (session?.kind !== 'shell') return;
    this.stopSession(session);
    this.drop(session);
  }

  private spawn(
    session: Session,
    cwd: string,
    command: string | { file: string; args: string[] } | undefined,
    size: TerminalSize,
  ): TerminalSession {
    const { id } = session;
    const { file, args, env } =
      typeof command === 'object'
        ? { ...command, env: {} as Record<string, string> }
        : shellCommand(this.shell, command);
    this.sessions.set(id, session);
    this.backend.request({
      type: 'spawn',
      id,
      file,
      args,
      cwd,
      env: {
        ...(process.env as Record<string, string>),
        ...env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      cols: size.cols,
      rows: size.rows,
    });
    this.notify(IPC.terminalChanged, this.view(session));
    return this.view(session);
  }

  /** Start every saved pista of a project; running ones are returned as is. */
  async startProject(projectId: string): Promise<TerminalSession[]> {
    const project = await this.repository.get(projectId);
    if (!project) return [];
    return Promise.all(
      project.terminals.map((t) => this.start(projectId, t.id)),
    );
  }

  stop(projectId: string, terminalId: string): void {
    this.stopSession(this.sessions.get(terminalKey(projectId, terminalId)));
  }

  stopProject(projectId: string): void {
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) this.stopSession(session);
    }
  }

  async stopAll(): Promise<void> {
    for (const session of this.sessions.values()) this.stopSession(session);
    if (this.runningCount() === 0) return;
    await new Promise<void>((done) => {
      const finish = () => {
        clearTimeout(timer);
        this.exitWaiters.delete(check);
        done();
      };
      const check = () => {
        if (this.runningCount() === 0) finish();
      };
      const timer = setTimeout(finish, STOP_TIMEOUT_MS);
      this.exitWaiters.add(check);
    });
  }

  write(id: string, data: string): void {
    this.backend.request({ type: 'write', id, data });
  }

  resize(id: string, size: TerminalSize): void {
    this.backend.request({ type: 'resize', id, ...size });
  }

  list(): TerminalSession[] {
    return [...this.sessions.values()].map((s) => this.view(s));
  }

  replay(id: string): Promise<TerminalReplay> {
    return this.backend.snapshot(id);
  }

  runningCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.status === 'running') count++;
    }
    return count;
  }

  saved(project: Project): void {
    const keep = new Set(project.terminals.map((t) => t.id));
    for (const session of [...this.sessions.values()]) {
      if (
        session.projectId !== project.id ||
        session.kind === 'shell' ||
        keep.has(session.terminalId)
      ) {
        continue;
      }
      this.stopSession(session);
      this.drop(session);
    }
  }

  async removed(id: string): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      if (session.projectId !== id) continue;
      this.stopSession(session);
      this.drop(session);
    }
  }

  private stopSession(session?: Session): void {
    if (!session || session.status !== 'running' || session.stopping) return;
    session.stopping = true;
    this.backend.request({ type: 'kill', id: session.id });
  }

  /** Forget a session and ask the host to free its buffer. */
  private drop(session: Session): void {
    this.sessions.delete(session.id);
    this.commands.delete(session.id);
    this.backend.request({ type: 'dispose', id: session.id });
    this.notify(IPC.terminalRemoved, session.id);
  }

  private fail(
    id: string,
    projectId: string,
    terminalId: string,
    error: AscuaError,
    extra: { kind: TerminalKind; name?: string } = { kind: 'pista' },
  ): TerminalSession {
    const session: Session = {
      id,
      projectId,
      terminalId,
      ...extra,
      status: 'failed',
      error,
      stopping: false,
    };
    this.sessions.set(id, session);
    this.notify(IPC.terminalChanged, this.view(session));
    return this.view(session);
  }

  private onHostEvent(event: HostEvent): void {
    if (event.type === 'data') {
      this.notify(IPC.terminalOutput, {
        id: event.id,
        data: event.data,
        seq: event.seq,
      });
      return;
    }
    if (event.type !== 'exit') return;

    const session = this.sessions.get(event.id);
    if (!session) return;
    const ok = session.stopping || event.exitCode === 0;
    session.status = ok ? 'stopped' : 'failed';
    session.exitCode = event.exitCode;
    session.error =
      ok || !event.error
        ? undefined
        : { code: 'terminal.spawnFailed', params: { detail: event.error } };
    session.stopping = false;
    this.notify(IPC.terminalChanged, this.view(session));
    for (const waiter of [...this.exitWaiters]) waiter();
    const listeners = this.exitListeners.get(event.id);
    if (listeners) {
      this.exitListeners.delete(event.id);
      for (const listener of listeners) listener();
    }
  }

  /** Calls `callback` once, the next time session `id` exits. */
  onExit(id: string, callback: () => void): void {
    const list = this.exitListeners.get(id) ?? [];
    list.push(callback);
    this.exitListeners.set(id, list);
  }

  private view(session: Session): TerminalSession {
    return {
      id: session.id,
      projectId: session.projectId,
      terminalId: session.terminalId,
      kind: session.kind,
      name: session.name,
      status: session.status,
      exitCode: session.exitCode,
      error: session.error,
    };
  }
}
