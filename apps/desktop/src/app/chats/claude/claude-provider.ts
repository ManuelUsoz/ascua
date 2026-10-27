import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import type {
  Options,
  Query,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import {
  ChatError,
  SessionTrace,
  type AgentProvider,
  type AgentEvent,
  type ChatCommand,
  type OpenOptions,
  type PermissionMode,
  type ProviderModel,
  type PermissionRequest,
  type PermissionDecision,
  type QuestionDecision,
  type QuestionRequest,
  type ProviderAuth,
  type ProviderSession,
  type ToolKind,
  type TurnResult,
} from '@ascua/chat';
import {
  ASK_USER_QUESTION,
  TurnMapper,
  toChatError,
  toQuestionRequest,
  toSdkAnswer,
  toPermissionRequest,
  toSdkPermission,
  toChatCommands,
  toProviderModels,
  toSdkPermissionMode,
  claudeRuntimeOptions,
  toStopReason,
  toUsage,
  toSdkMcpServers,
} from './claude-mapping';
import { chatLog } from '../chat-log';
import { toSdkHooks } from './claude-hooks';
import { toSdkAgents } from './claude-agents';
import {
  claudeEnv,
  claudeExecutable,
  loadClaudeSdk,
  type ClaudeExecutable,
  type ClaudeSdk,
} from './claude-runtime';

const AUTH_TIMEOUT_MS = 5000;

// Chat-domain tool kinds to Claude tool names, for `allowedTools`.
const TOOL_NAMES: Record<ToolKind, string[]> = {
  read: ['Read'],
  edit: ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'],
  execute: ['Bash'],
  search: ['Grep', 'Glob', 'WebSearch'],
  fetch: ['WebFetch'],
  other: [],
};

export interface ClaudeProviderDeps {
  loadSdk: () => Promise<ClaudeSdk>;
  executable: () => ClaudeExecutable;
  env: () => NodeJS.ProcessEnv;
  ids: () => string;
  home: () => string;
  runAuthStatus: (
    exe: ClaudeExecutable,
    env: NodeJS.ProcessEnv,
  ) => Promise<{ code: number | null; stdout: string }>;
}

interface AuthStatusJson {
  loggedIn?: boolean;
  email?: string;
  subscriptionType?: string;
}

function parseAuthStatus(stdout: string): AuthStatusJson | undefined {
  try {
    const v: unknown = JSON.parse(stdout);
    return v && typeof v === 'object' ? (v as AuthStatusJson) : undefined;
  } catch {
    return undefined;
  }
}

function execAuthStatus(
  exe: ClaudeExecutable,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string }> {
  const file = exe.executable ?? exe.path;
  const args = exe.executable
    ? [exe.path, 'auth', 'status', '--json']
    : ['auth', 'status', '--json'];
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        env: claudeEnv(env, exe) as NodeJS.ProcessEnv,
        timeout: AUTH_TIMEOUT_MS,
        windowsHide: true,
        // .cmd shims on Windows need a shell; args are fixed literals.
        shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(file),
      },
      (err, stdout) => {
        if (!err) return resolve({ code: 0, stdout });
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        if (e.code === 'ENOENT' || e.killed) return reject(e);
        resolve({
          code: typeof e.code === 'number' ? e.code : null,
          stdout: String(stdout ?? ''),
        });
      },
    );
  });
}

const defaults: ClaudeProviderDeps = {
  loadSdk: loadClaudeSdk,
  executable: () => claudeExecutable(),
  env: () => process.env,
  ids: randomUUID,
  home: homedir,
  runAuthStatus: execAuthStatus,
};

/** Async queue feeding a streaming-input query. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private readonly items: SDKUserMessage[] = [];
  private waiter?: (r: IteratorResult<SDKUserMessage>) => void;
  private done = false;

  push(m: SDKUserMessage): void {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = undefined;
      w({ value: m, done: false });
    } else this.items.push(m);
  }

  end(): void {
    this.done = true;
    this.waiter?.({ value: undefined, done: true });
    this.waiter = undefined;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const v = this.items.shift();
        if (v) return Promise.resolve({ value: v, done: false });
        if (this.done) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => (this.waiter = resolve));
      },
    };
  }
}

export class ClaudeProvider implements AgentProvider {
  readonly descriptor = { id: 'claude', enabled: true } as const;
  private readonly deps: ClaudeProviderDeps;

  constructor(deps: Partial<ClaudeProviderDeps> = {}) {
    this.deps = { ...defaults, ...deps };
  }

  loginCommand(): { file: string; args: string[] } {
    return { file: this.deps.executable().path, args: ['/login'] };
  }

  async authStatus(): Promise<ProviderAuth> {
    const id = this.descriptor.id;
    const { env, home } = this.deps;
    if (env()['ANTHROPIC_API_KEY']) {
      return { provider: id, state: 'loggedIn' };
    }
    let q: Query | undefined;
    try {
      const exe = this.deps.executable();
      try {
        const res = await this.deps.runAuthStatus(exe, env());
        const parsed = parseAuthStatus(res.stdout);
        if (parsed?.loggedIn === true) {
          const email = parsed.email;
          const plan = parsed.subscriptionType;
          return {
            provider: id,
            state: 'loggedIn',
            ...(email || plan ? { account: { email, plan } } : {}),
          };
        }
        if (parsed?.loggedIn === false) {
          return { provider: id, state: 'loggedOut' };
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          return { provider: id, state: 'unavailable', error: 'agentMissing' };
        }
        /* timeout or other failure: fall back to the SDK probe */
      }
      const sdk = await this.deps.loadSdk();
      const input = new InputQueue();
      q = sdk.query({
        prompt: input,
        options: this.baseOptions(exe, home()),
      });
      const query = q;
      const info = await Promise.race([
        query.accountInfo(),
        new Promise<undefined>((r) => setTimeout(r, AUTH_TIMEOUT_MS)),
      ]);
      if (info && (info.email || info.apiKeySource || info.tokenSource)) {
        return {
          provider: id,
          state: 'loggedIn',
          account: { email: info.email, plan: info.subscriptionType },
        };
      }
      return { provider: id, state: 'loggedOut' };
    } catch (err) {
      const e = toChatError(err, 'start');
      if (e.kind === 'authRequired')
        return { provider: id, state: 'loggedOut' };
      return { provider: id, state: 'unavailable', error: 'agentMissing' };
    } finally {
      try {
        q?.close();
      } catch {
        /* already closed */
      }
    }
  }

  async capabilities(
    cwd: string,
  ): Promise<{ commands: ChatCommand[]; models: ProviderModel[] }> {
    let q: Query | undefined;
    try {
      const sdk = await this.deps.loadSdk();
      const exe = this.deps.executable();
      q = sdk.query({
        prompt: new InputQueue(),
        options: this.baseOptions(exe, cwd),
      });
      const query = q;
      const init = await Promise.race([
        query.initializationResult(),
        new Promise<undefined>((r) => setTimeout(r, AUTH_TIMEOUT_MS)),
      ]);
      if (!init) return { commands: [], models: [] };
      return {
        commands: toChatCommands(init.commands ?? []),
        models: toProviderModels(init.models ?? []),
      };
    } catch {
      return { commands: [], models: [] };
    } finally {
      try {
        q?.close();
      } catch {
        /* already closed */
      }
    }
  }

  private baseOptions(exe: ClaudeExecutable, cwd: string): Options {
    return {
      cwd,
      pathToClaudeCodeExecutable: exe.path,
      ...(exe.executable ? { executable: exe.executable as 'node' } : {}),
      env: claudeEnv(this.deps.env(), exe),
      settingSources: ['user', 'project', 'local'],
    };
  }

  async open(options: OpenOptions): Promise<ProviderSession> {
    let sdk: ClaudeSdk;
    let exe: ClaudeExecutable;
    try {
      sdk = await this.deps.loadSdk();
      exe = this.deps.executable();
    } catch (err) {
      throw toChatError(err, 'start');
    }
    const token = options.resumeToken ?? this.deps.ids();
    const input = new InputQueue();
    const mapper = new TurnMapper();
    const session = new ClaudeSession(token, input, options);

    const opts: Options = {
      ...this.baseOptions(exe, options.cwd),
      includePartialMessages: true,
      ...claudeRuntimeOptions(options.runtime),
      ...(options.resumeToken
        ? { resume: options.resumeToken }
        : { sessionId: token }),
      canUseTool: (name, toolInput, o) => {
        // Questions always reach the user, whatever the permission mode.
        if (name === ASK_USER_QUESTION) {
          if (o.signal.aborted) {
            return Promise.resolve(
              toSdkAnswer({ answered: false, reason: 'aborted' }, toolInput),
            );
          }
          const q = toQuestionRequest(this.deps.ids(), toolInput, o.toolUseID);
          if (!q) {
            return Promise.resolve(
              toSdkAnswer({ answered: false, reason: 'skipped' }, toolInput),
            );
          }
          return session.question(q).then((d) => toSdkAnswer(d, toolInput));
        }
        if (o.signal.aborted) {
          return Promise.resolve(
            toSdkPermission({ allow: false, reason: 'aborted' }, toolInput),
          );
        }
        const req = toPermissionRequest(
          this.deps.ids(),
          name,
          toolInput,
          o.toolUseID,
        );
        return session.ask(req).then((d) => toSdkPermission(d, toolInput));
      },
    };
    const mcp = options.mcpServers ?? [];
    if (mcp.length) opts.mcpServers = toSdkMcpServers(mcp);
    const allowed = options.turn.allowedTools?.flatMap((k) => TOOL_NAMES[k]);
    // `mcp__<server>` allows every tool of that server.
    if (allowed?.length) {
      opts.allowedTools = [...allowed, ...mcp.map((s) => `mcp__${s.name}`)];
    }
    if (options.turn.systemAppend) {
      opts.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: options.turn.systemAppend,
      };
    }

    if (options.turn.gates?.length) {
      opts.hooks = toSdkHooks(options.turn.gates, new SessionTrace(), (name) =>
        (Object.keys(TOOL_NAMES) as ToolKind[]).find((k) =>
          TOOL_NAMES[k].includes(name),
        ),
      );
    }

    const denied = options.turn.deniedTools?.flatMap((k) => TOOL_NAMES[k]);
    if (denied?.length) opts.disallowedTools = denied;

    if (options.turn.agents?.length) {
      const agents = toSdkAgents(options.turn.agents, TOOL_NAMES, mcp);
      if (Object.keys(agents).length) opts.agents = agents;
    }

    let q: Query;
    try {
      q = sdk.query({ prompt: input, options: opts });
      const init = await q.initializationResult();
      options.onEvent({
        type: 'sessionInfo',
        commands: toChatCommands(init?.commands ?? []),
        ...(init?.models?.length
          ? { models: toProviderModels(init.models) }
          : {}),
      });
    } catch (err) {
      throw toChatError(err, 'start');
    }
    session.start(q, mapper);
    return session;
  }
}

class ClaudeSession implements ProviderSession {
  private q?: Query;
  private turn?: {
    resolve: (r: TurnResult) => void;
    reject: (e: unknown) => void;
  };
  private aborted = false;
  private lastCost = 0;
  private closed = false;
  private readonly asks = new Set<(d: PermissionDecision) => void>();
  private readonly questions = new Set<(d: QuestionDecision) => void>();

  constructor(
    readonly resumeToken: string,
    private readonly input: InputQueue,
    private readonly options: OpenOptions,
  ) {}

  ask(req: PermissionRequest): Promise<PermissionDecision> {
    return new Promise((resolve) => {
      this.asks.add(resolve);
      this.options.onPermission(req).then(
        (d) => {
          this.asks.delete(resolve);
          resolve(d);
        },
        () => {
          this.asks.delete(resolve);
          resolve({ allow: false, reason: 'denied' });
        },
      );
    });
  }

  question(req: QuestionRequest): Promise<QuestionDecision> {
    return new Promise((resolve) => {
      this.questions.add(resolve);
      this.options.onQuestion(req).then(
        (d) => {
          this.questions.delete(resolve);
          resolve(d);
        },
        () => {
          this.questions.delete(resolve);
          resolve({ answered: false, reason: 'aborted' });
        },
      );
    });
  }

  private abortAsks(): void {
    for (const resolve of this.asks)
      resolve({ allow: false, reason: 'aborted' });
    this.asks.clear();
    for (const resolve of this.questions)
      resolve({ answered: false, reason: 'aborted' });
    this.questions.clear();
  }

  start(q: Query, mapper: TurnMapper): void {
    this.q = q;
    void (async () => {
      try {
        for await (const msg of q) {
          const events: AgentEvent[] = mapper.map(msg);
          if (msg.type !== 'stream_event') {
            const meta = msg as unknown as {
              subtype?: string;
              parent_tool_use_id?: string | null;
            };
            chatLog('sdk message', {
              type: msg.type,
              subtype: meta.subtype,
              parent: meta.parent_tool_use_id ?? undefined,
              events: events.map((e) => e.type),
              turnActive: !!this.turn,
            });
          }
          for (const e of events) this.options.onEvent(e);
          if (msg.type === 'result') this.settle(msg, mapper.takeError());
        }
        this.fail(new ChatError('exited'));
      } catch (err) {
        this.fail(toChatError(err, 'prompt'));
      }
    })();
  }

  private settle(result: SDKResultMessage, recorded?: ChatError): void {
    const turn = this.turn;
    if (!turn) {
      chatLog('result without active turn (unsolicited, e.g. background task)');
      return;
    }
    const r = result as unknown as {
      is_error?: boolean;
      terminal_reason?: string;
      result?: string;
    };
    if (recorded || (r.is_error && r.terminal_reason === 'api_error')) {
      this.aborted = false;
      this.fail(recorded ?? toChatError(new Error(r.result ?? ''), 'prompt'));
      return;
    }
    this.turn = undefined;
    const usage = toUsage(result);
    if (usage.costUsd !== undefined) {
      // Cost is a running total for the query: report the turn's share.
      const total = usage.costUsd;
      usage.costUsd = Math.max(0, total - this.lastCost);
      this.lastCost = total;
    }
    const stop = toStopReason(result, this.aborted);
    this.aborted = false;
    this.options.onEvent({ type: 'usage', usage, stop });
    turn.resolve({ stop, usage });
  }

  private fail(err: unknown): void {
    const turn = this.turn;
    this.turn = undefined;
    turn?.reject(err);
  }

  prompt(text: string): Promise<TurnResult> {
    if (this.closed) return Promise.reject(new ChatError('exited'));
    if (this.turn) return Promise.reject(new ChatError('busy'));
    return new Promise((resolve, reject) => {
      this.turn = { resolve, reject };
      this.aborted = false;
      this.input.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
      });
    });
  }

  async setPermissionMode(mode: PermissionMode): Promise<void> {
    await this.q?.setPermissionMode(toSdkPermissionMode(mode));
  }

  abort(): void {
    if (!this.turn) return;
    this.aborted = true;
    this.abortAsks();
    void this.q?.interrupt().catch(() => undefined);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.abortAsks();
    this.input.end();
    try {
      this.q?.close();
    } catch {
      /* already closed */
    }
    this.fail(new ChatError('exited'));
  }
}
