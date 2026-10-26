import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AssistantError,
  type AssistantErrorKind,
  type AssistantEngine,
  type AssistantEvent,
  type AssistantStatus,
} from '@ascua/assistant';
import type { Language } from '@ascua/ipc';
import type { ClaudeCommand } from './claude-binary';
import { claudeArgs } from './claude-args';
import { personaPrompt } from './persona';
import { killTree } from '../../../terminals/host/kill-tree';
import { newStreamState, StreamJsonParser, toEvents } from './stream-json';

type Listener = (chunk: Buffer | string) => void;

/** The slice of `ChildProcess` the engine uses. */
export interface ChildLike {
  stdin: { write(data: string): unknown; end(): unknown } | null;
  stdout: { on(event: 'data', cb: Listener): unknown } | null;
  stderr: { on(event: 'data', cb: Listener): unknown } | null;
  on(event: 'error', cb: (e: NodeJS.ErrnoException) => void): unknown;
  on(event: 'exit', cb: (code: number | null) => void): unknown;
  pid?: number;
  kill(): unknown;
}

export type SpawnLike = (
  file: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    shell: boolean;
    windowsHide: boolean;
  },
) => ChildLike;

export interface ClaudeCodeEngineDeps {
  resolve: () => ClaudeCommand | undefined;
  spawn: SpawnLike;
  workDir: string;
  endpoint: () => Promise<{ url: string; token: string }>;
  language: () => Promise<Language>;
  /** Every registry tool; the registry's Confirmer is the only gate. */
  tools: () => string[];
  /** Written as `timeout` on the mcp.json server (the CLI caps HTTP calls at 60 s otherwise). */
  toolTimeoutMs?: number;
  /** Timing sink (dev only). */
  log?: (event: string, data: Record<string, unknown>) => void;
  env?: NodeJS.ProcessEnv;
  /** Creates the working directory; defaults to a recursive `fs.mkdir`. */
  mkdir?: (dir: string) => Promise<unknown>;
  /**
   * Kills a process and its children. Used for the `shell: true` (Windows
   * `.cmd`) path, where `child.kill()` only ends cmd.exe and leaves `claude`.
   */
  killTree?: (pid: number, fallback: () => void) => void;
}

const STATUS_TIMEOUT_MS = 15000;
const INTERRUPT_TIMEOUT_MS = 3000;
/** A warm process nobody talks to is reaped; the session resumes on the next spawn. */
const IDLE_KILL_MS = 10 * 60_000;

/**
 * Even with --strict-mcp-config the CLI loads the user's claude.ai connectors
 * in the background, adding tool definitions to every turn. Ascua needs none.
 */
const CLAUDE_ENV: NodeJS.ProcessEnv = { ENABLE_CLAUDEAI_MCP_SERVERS: 'false' };

interface Drain {
  child: ChildLike;
  done: Promise<void>;
  finish: () => void;
  timer: ReturnType<typeof setTimeout>;
}

interface TurnTiming {
  warm: boolean;
  sentAt: number;
  firstDeltaAt?: number;
}

/** Quote for cmd.exe (the `.cmd` shim path). Persona has no quotes. */
export function shellArg(arg: string): string {
  const flat = arg.replace(/\s+/g, ' ');
  return flat === '' || /[\s,]/.test(flat) ? `"${flat}"` : flat;
}

export class ClaudeCodeEngine implements AssistantEngine {
  private readonly listeners = new Set<(e: AssistantEvent) => void>();
  private cached: AssistantStatus | undefined;
  private proc: ChildLike | undefined;
  private procShell = false;
  private current: string | undefined;
  private sessionId: string | undefined;
  private starting: Promise<ChildLike> | undefined;
  private warming = false;
  private drain: Drain | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private timing: TurnTiming | undefined;
  private turnWritten = false;
  private interrupts = 0;
  /** Bumped on every kill so a spawn still in flight can notice and abort. */
  private epoch = 0;
  private spawnedAt = 0;
  private initAt: number | undefined;

  constructor(private readonly deps: ClaudeCodeEngineDeps) {}

  onEvent(listener: (event: AssistantEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async status(refresh = false): Promise<AssistantStatus> {
    if (this.current) return { state: 'busy' };
    if (this.cached && !refresh) return this.cached;
    const command = this.deps.resolve();
    if (!command)
      return this.settle({ state: 'unavailable', reason: 'notInstalled' });
    // spawn reports ENOENT for a missing cwd, which would look like "not installed".
    await this.ensureWorkDir();
    const result = await this.authStatus(command);
    if (result === 'missing') {
      return this.settle({ state: 'unavailable', reason: 'notInstalled' });
    }
    if (result === 'loggedOut') {
      return this.settle({ state: 'unavailable', reason: 'notLoggedIn' });
    }
    if (result === 'unknown') return { state: 'ready' }; // not cached
    return this.settle({ state: 'ready' });
  }

  warm(): void {
    if (this.warming || this.busyOrSpawned()) return;
    this.warming = true;
    void this.status()
      .then((status) => {
        this.warming = false;
        if (status.state !== 'ready' || this.busyOrSpawned()) return;
        const command = this.deps.resolve();
        if (!command) return;
        return this.ensureProcess(command).then(() => this.armIdle());
      })
      .catch(() => {
        this.warming = false;
      });
  }

  async send(turn: string, text: string): Promise<void> {
    if (this.current) throw new AssistantError('busy');
    const command = this.deps.resolve();
    if (!command) {
      this.settle({ state: 'unavailable', reason: 'notInstalled' });
      this.emit({ type: 'error', turn, kind: 'notInstalled' });
      return;
    }
    this.clearIdle();
    this.current = turn;
    this.turnWritten = false;
    this.timing = {
      warm: !!(this.proc || this.starting),
      sentAt: performance.now(),
    };
    this.emit({ type: 'status', status: { state: 'busy' } });
    // A cancelled turn's interrupt result must not be read as this turn's.
    await this.drain?.done;
    if (this.current !== turn) return;
    let proc: ChildLike;
    try {
      proc = await this.ensureProcess(command);
    } catch {
      if (this.current !== turn) return;
      this.finishTurn();
      this.emit({ type: 'error', turn, kind: 'failed' });
      this.settle({ state: 'ready' });
      return;
    }
    // Cancelled while the process was spawning: it stays warm, nothing is sent.
    if (this.current !== turn) return;
    const line = {
      type: 'user',
      message: { role: 'user', content: text },
    };
    this.turnWritten = true;
    proc.stdin?.write(JSON.stringify(line) + '\n');
  }

  cancel(): void {
    const turn = this.current;
    if (!turn) return;
    const proc = this.proc;
    const written = this.turnWritten;
    this.finishTurn();
    if (proc && written) this.interrupt(proc);
    this.emit({ type: 'turnDone', turn, outcome: 'cancelled' });
    this.settle({ state: 'ready' });
    this.armIdle();
  }

  reset(): void {
    this.killProcess();
    this.finishTurn();
    this.sessionId = undefined;
    this.settle({ state: 'ready' });
  }

  stop(): void {
    this.killProcess();
    this.finishTurn();
    void rm(join(this.deps.workDir, 'mcp.json'), { force: true });
  }

  private busyOrSpawned(): boolean {
    return !!(this.proc || this.starting || this.current);
  }

  private finishTurn(): void {
    this.current = undefined;
    this.timing = undefined;
    this.turnWritten = false;
  }

  /** Shared by `warm` and `send`: one spawn, however many callers. */
  private ensureProcess(command: ClaudeCommand): Promise<ChildLike> {
    if (this.proc) return Promise.resolve(this.proc);
    this.starting ??= this.start(command).finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private armIdle(): void {
    this.clearIdle();
    if (!this.proc || this.current) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (!this.current) this.killProcess(); // sessionId is kept: next spawn resumes
    }, IDLE_KILL_MS);
    this.idleTimer.unref?.();
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  /**
   * Stops the running turn but keeps the process: it answers the interrupt,
   * then emits an error `result` that `onDrainLine` swallows. A failed
   * interrupt or no result in time falls back to killing the process.
   */
  private interrupt(child: ChildLike): void {
    this.endDrain();
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    const timer = setTimeout(() => {
      if (this.proc === child) this.killProcess();
      this.endDrain();
    }, INTERRUPT_TIMEOUT_MS);
    timer.unref?.();
    this.drain = { child, done, finish, timer };
    const request = {
      type: 'control_request',
      request_id: `interrupt-${++this.interrupts}`,
      request: { subtype: 'interrupt' },
    };
    try {
      child.stdin?.write(JSON.stringify(request) + '\n');
    } catch {
      this.killProcess();
    }
  }

  private endDrain(): void {
    const drain = this.drain;
    this.drain = undefined;
    if (!drain) return;
    clearTimeout(drain.timer);
    drain.finish();
  }

  private onDrainLine(child: ChildLike, line: Record<string, unknown>): void {
    if (line['type'] === 'result') {
      this.endDrain();
    } else if (line['type'] === 'control_response') {
      const response = line['response'] as { subtype?: unknown } | undefined;
      if (response?.subtype === 'error' && this.proc === child) {
        this.killProcess();
      }
    }
  }

  private ensureWorkDir(): Promise<unknown> {
    const { workDir } = this.deps;
    return (this.deps.mkdir ?? ((d) => mkdir(d, { recursive: true })))(workDir);
  }

  private killProcess(): void {
    this.epoch++;
    this.clearIdle();
    this.endDrain();
    const proc = this.proc;
    this.proc = undefined; // its exit handler must not report a crash
    const viaShell = this.procShell;
    this.procShell = false;
    if (!proc) return;
    try {
      if (viaShell && proc.pid !== undefined) {
        (this.deps.killTree ?? killTree)(proc.pid, () => proc.kill());
      } else {
        proc.kill();
      }
    } catch {
      // already gone
    }
  }

  private async start(command: ClaudeCommand): Promise<ChildLike> {
    const { workDir } = this.deps;
    const epoch = this.epoch;
    await this.ensureWorkDir();
    const endpoint = await this.deps.endpoint();
    const mcpConfig = join(workDir, 'mcp.json');
    await writeFile(
      mcpConfig,
      JSON.stringify({
        mcpServers: {
          ascua: {
            type: 'http',
            url: endpoint.url,
            headers: { Authorization: `Bearer ${endpoint.token}` },
            ...(this.deps.toolTimeoutMs !== undefined && {
              timeout: this.deps.toolTimeoutMs,
            }),
          },
        },
      }),
      { mode: 0o600 },
    );
    const persona = personaPrompt(await this.deps.language());
    // reset/stop while spawning: do not leave a process nobody owns.
    if (epoch !== this.epoch) throw new Error('stopped');
    const args = [
      ...command.prefixArgs,
      ...claudeArgs({
        mcpConfig,
        persona,
        tools: this.deps.tools(),
        resume: this.sessionId,
      }),
    ];
    const child = this.deps.spawn(
      command.file,
      command.shell ? args.map(shellArg) : args,
      {
        cwd: workDir,
        env: this.childEnv(command),
        shell: command.shell,
        windowsHide: true,
      },
    );
    this.procShell = command.shell;
    this.proc = child;
    this.spawnedAt = performance.now();
    this.initAt = undefined;
    this.attach(child);
    return child;
  }

  private childEnv(command: ClaudeCommand): NodeJS.ProcessEnv {
    return {
      ...(this.deps.env ?? process.env),
      ...CLAUDE_ENV,
      ...command.env,
    };
  }

  private reportTurn(): void {
    const { log } = this.deps;
    const t = this.timing;
    if (!log || !t) return;
    const now = performance.now();
    log('turn', {
      warm: t.warm,
      spawnToInitMs:
        this.initAt === undefined
          ? undefined
          : Math.round(this.initAt - this.spawnedAt),
      sendToFirstDeltaMs:
        t.firstDeltaAt === undefined
          ? undefined
          : Math.round(t.firstDeltaAt - t.sentAt),
      sendToDoneMs: Math.round(now - t.sentAt),
    });
  }

  private attach(child: ChildLike): void {
    const parser = new StreamJsonParser();
    const state = newStreamState();
    state.sessionId = this.sessionId;
    child.stdout?.on('data', (chunk) => {
      if (this.proc !== child) return;
      for (const line of parser.push(chunk.toString())) {
        if (this.proc !== child) return;
        if (line['type'] === 'system' && line['subtype'] === 'init') {
          this.initAt ??= performance.now();
          // A prewarmed process has no turn yet but still owns the session.
          if (typeof line['session_id'] === 'string') {
            this.sessionId = line['session_id'];
          }
        }
        if (this.drain?.child === child) {
          this.onDrainLine(child, line);
          continue;
        }
        const turn = this.current;
        if (!turn) continue;
        for (const event of toEvents(line, turn, state)) {
          if (state.sessionId) this.sessionId = state.sessionId;
          if (event.type === 'text' && this.timing) {
            this.timing.firstDeltaAt ??= performance.now();
          }
          this.emit(event);
          if (event.type === 'turnDone') {
            this.reportTurn();
            this.finishTurn();
            this.settle({ state: 'ready' });
            this.armIdle();
          } else if (event.type === 'error') {
            this.fail(child, event.kind);
            return;
          }
        }
        if (state.sessionId) this.sessionId = state.sessionId;
      }
    });
    child.stderr?.on('data', () => undefined);
    child.on('error', (e) => {
      if (this.proc !== child) return;
      this.dropProcess();
      const kind = e.code === 'ENOENT' ? 'notInstalled' : 'failed';
      this.endTurn(kind);
      if (kind === 'notInstalled') {
        this.settle({ state: 'unavailable', reason: 'notInstalled' });
      }
    });
    child.on('exit', () => {
      if (this.proc !== child) return;
      this.dropProcess();
      this.endTurn('crashed');
    });
  }

  /** The process is gone on its own: nothing left to drain or reap. */
  private dropProcess(): void {
    this.proc = undefined;
    this.clearIdle();
    this.endDrain();
  }

  /** An error line ends the turn; the process is dropped and respawned. */
  private fail(child: ChildLike, kind: AssistantErrorKind): void {
    if (this.proc === child) this.killProcess();
    this.finishTurn();
    if (kind === 'notLoggedIn') {
      this.settle({ state: 'unavailable', reason: 'notLoggedIn' });
    } else {
      this.settle({ state: 'ready' });
    }
  }

  private endTurn(kind: 'crashed' | 'notInstalled' | 'failed'): void {
    const turn = this.current;
    if (!turn) return;
    this.finishTurn();
    this.emit({ type: 'error', turn, kind });
    if (kind !== 'notInstalled') this.settle({ state: 'ready' });
  }

  private authStatus(
    command: ClaudeCommand,
  ): Promise<'ok' | 'loggedOut' | 'missing' | 'unknown'> {
    return new Promise((resolve) => {
      let out = '';
      let done = false;
      const finish = (r: 'ok' | 'loggedOut' | 'missing' | 'unknown') => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(r);
      };
      let child: ChildLike;
      const args = [...command.prefixArgs, 'auth', 'status', '--json'];
      try {
        child = this.deps.spawn(command.file, args, {
          cwd: this.deps.workDir,
          env: this.childEnv(command),
          shell: command.shell,
          windowsHide: true,
        });
      } catch (e) {
        finish(
          (e as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'missing'
            : 'unknown',
        );
        return;
      }
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // already gone
        }
        finish('unknown');
      }, STATUS_TIMEOUT_MS);
      child.stdout?.on('data', (c) => (out += c.toString()));
      child.on('error', (e) =>
        finish(e.code === 'ENOENT' ? 'missing' : 'unknown'),
      );
      child.on('exit', () => {
        try {
          const parsed = JSON.parse(out) as { loggedIn?: unknown };
          if (parsed.loggedIn === true) finish('ok');
          else if (parsed.loggedIn === false) finish('loggedOut');
          else finish('unknown');
        } catch {
          finish('unknown');
        }
      });
    });
  }

  private settle(status: AssistantStatus): AssistantStatus {
    this.cached = status;
    this.emit({ type: 'status', status });
    return status;
  }

  private emit(event: AssistantEvent): void {
    for (const l of [...this.listeners]) l(event);
  }
}
