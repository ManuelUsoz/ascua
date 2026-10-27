import { describe, expect, it, vi } from 'vitest';
import {
  ChatError,
  searcherAgent,
  type AgentEvent,
  type OpenOptions,
} from '@ascua/chat';
import { ClaudeProvider } from './claude-provider';

type Msg = Record<string, unknown>;

/** A scripted fake `query`: `script(input, opts)` yields messages per user prompt. */
function fakeSdk(
  script: (
    opts: Record<string, any>,
    emit: (m: Msg) => void,
  ) => void | Promise<void>,
  extra: Partial<{
    init: () => Promise<unknown>;
    account: object;
    supported: () => Promise<unknown>;
  }> = {},
) {
  const closed = vi.fn();
  const interrupt = vi.fn(async () => undefined);
  const sdk = {
    query: ({
      prompt,
      options,
    }: {
      prompt: AsyncIterable<unknown>;
      options: Record<string, any>;
    }) => {
      const out: Msg[] = [];
      let wake: (() => void) | undefined;
      let ended = false;
      const emit = (m: Msg) => {
        out.push(m);
        wake?.();
      };
      void (async () => {
        for await (const _ of prompt) await script(options, emit);
      })();
      return {
        initializationResult: extra.init ?? (async () => ({})),
        accountInfo: async () => extra.account ?? {},
        supportedCommands: extra.supported ?? (async () => []),
        interrupt,
        close: () => {
          ended = true;
          closed();
          wake?.();
        },
        async *[Symbol.asyncIterator]() {
          while (!ended) {
            if (out.length) yield out.shift();
            else await new Promise<void>((r) => (wake = r));
          }
        },
      };
    },
  };
  return { sdk, closed, interrupt };
}

const result = (extra: Msg = {}): Msg => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 2 },
  total_cost_usd: 0.1,
  modelUsage: { m: {} },
  ...extra,
});

function provider(sdk: unknown, over: Record<string, unknown> = {}) {
  let n = 0;
  return new ClaudeProvider({
    loadSdk: async () => sdk as never,
    executable: () => ({ path: 'claude' }),
    env: () => ({}),
    ids: () => `id${++n}`,
    home: () => '/home',
    runAuthStatus: async () => ({ code: 1, stdout: '' }),
    ...over,
  });
}

const open = (
  p: ClaudeProvider,
  o: Partial<OpenOptions> = {},
  events: AgentEvent[] = [],
) =>
  p.open({
    cwd: '/p',
    turn: {},
    runtime: { permissionMode: 'supervised' },
    onEvent: (e) => events.push(e),
    onPermission: async () => ({ allow: true }),
    onQuestion: async () => ({ answered: false, reason: 'skipped' }),
    ...o,
  });

describe('ClaudeProvider', () => {
  it('streams a turn and settles with usage', async () => {
    const { sdk } = fakeSdk((_o, emit) => {
      emit({
        type: 'stream_event',
        parent_tool_use_id: null,
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'a' },
        },
      });
      emit(result());
    });
    const events: AgentEvent[] = [];
    const s = await open(provider(sdk), {}, events);
    const r = await s.prompt('hi');
    expect(r.stop).toBe('endTurn');
    expect(r.usage).toMatchObject({
      inputTokens: 1,
      outputTokens: 2,
      costUsd: 0.1,
    });
    expect(events.find((e) => e.type === 'messageDelta')).toMatchObject({
      text: 'a',
    });
    // second turn reports the cost delta
    const r2 = await s.prompt('again');
    expect(r2.usage.costUsd).toBeCloseTo(0);
    s.close();
  });

  it('rejects the turn with authRequired on a synthetic auth error', async () => {
    let n = 0;
    const { sdk } = fakeSdk((_o, emit) => {
      if (n++ === 0) {
        emit({
          type: 'assistant',
          error: 'authentication_failed',
          is_api_error_message: true,
          message: {
            model: '<synthetic>',
            content: [{ type: 'text', text: 'Failed to authenticate' }],
          },
        });
        emit(
          result({
            is_error: true,
            terminal_reason: 'api_error',
            result: 'Failed to authenticate',
          }),
        );
      } else emit(result());
    });
    const s = await open(provider(sdk));
    await expect(s.prompt('hi')).rejects.toMatchObject({
      kind: 'authRequired',
    });
    await expect(s.prompt('again')).resolves.toMatchObject({
      stop: 'endTurn',
    });
    s.close();
  });

  it('sets in-memory hooks and the system append when the turn has gates', async () => {
    const seen: Record<string, any>[] = [];
    const { sdk } = fakeSdk(() => undefined);
    const orig = sdk.query;
    sdk.query = (a: any) => {
      seen.push(a.options);
      return orig(a);
    };
    const gate = {
      id: 'g',
      on: 'beforeTool' as const,
      check: () => ({ allow: true as const }),
    };
    (
      await open(provider(sdk), { turn: { gates: [gate], systemAppend: 'X' } })
    ).close();
    (await open(provider(sdk))).close();
    expect(seen[0]['hooks'].PreToolUse).toHaveLength(1);
    expect(seen[0]['hooks'].PostToolUse).toHaveLength(1);
    expect(seen[0]['systemPrompt']).toMatchObject({ append: 'X' });
    expect(seen[1]['hooks']).toBeUndefined();
  });

  it('maps mcpServers to stdio options and allows them when restricted', async () => {
    const seen: Record<string, any>[] = [];
    const { sdk } = fakeSdk(() => undefined);
    const orig = sdk.query;
    sdk.query = (a: any) => {
      seen.push(a.options);
      return orig(a);
    };
    const spec = {
      name: 'ascua-indexer',
      command: 'node',
      args: ['x.mjs'],
      env: { A: '1' },
    };
    (await open(provider(sdk), { mcpServers: [spec] })).close();
    (await open(provider(sdk))).close();
    (
      await open(provider(sdk), {
        mcpServers: [spec],
        turn: { allowedTools: ['read'] },
      })
    ).close();
    expect(seen[0]['mcpServers']).toEqual({
      'ascua-indexer': {
        type: 'stdio',
        command: 'node',
        args: ['x.mjs'],
        env: { A: '1' },
      },
    });
    expect(seen[0]['allowedTools']).toBeUndefined();
    expect(seen[1]['mcpServers']).toBeUndefined();
    expect(seen[2]['allowedTools']).toContain('mcp__ascua-indexer');
  });

  it('passes the searcher subagent when the indexer is present', async () => {
    const seen: Record<string, any>[] = [];
    const { sdk } = fakeSdk(() => undefined);
    const orig = sdk.query;
    sdk.query = (a: any) => {
      seen.push(a.options);
      return orig(a);
    };
    const spec = { name: 'ascua-indexer', command: 'node', args: ['x.mjs'] };
    (
      await open(provider(sdk), {
        mcpServers: [spec],
        turn: { agents: [searcherAgent()] },
      })
    ).close();
    (
      await open(provider(sdk), { turn: { agents: [searcherAgent()] } })
    ).close();
    expect(seen[0]['agents']['searcher'].tools).toEqual([
      'mcp__ascua-indexer',
    ]);
    expect(seen[1]['agents']).toBeUndefined();
  });

  it('emits custom commands after init and maps deniedTools', async () => {
    let seen: Record<string, any> = {};
    const { sdk } = fakeSdk(() => undefined, {
      init: async () => ({
        commands: [
          {
            name: 'compact',
            description: 'x',
            argumentHint: '',
            builtin: true,
          },
          { name: 'deploy', description: 'Ship', argumentHint: '<env>' },
        ],
      }),
    });
    const orig = sdk.query;
    sdk.query = (a: any) => {
      seen = a.options;
      return orig(a);
    };
    const events: AgentEvent[] = [];
    const s = await open(
      provider(sdk),
      { turn: { deniedTools: ['edit', 'execute'] } },
      events,
    );
    expect(events[0]).toEqual({
      type: 'sessionInfo',
      commands: [
        {
          name: 'deploy',
          source: 'custom',
          description: 'Ship',
          argumentHint: '<env>',
        },
      ],
    });
    expect(seen['disallowedTools']).toEqual([
      'Edit',
      'MultiEdit',
      'Write',
      'NotebookEdit',
      'Bash',
    ]);
    s.close();
  });

  it('capabilities() returns commands and models and fails open', async () => {
    const ok = fakeSdk(() => undefined, {
      init: async () => ({
        commands: [
          { name: 'init', builtin: true },
          { name: 'deploy', description: 'Ship' },
        ],
        models: [
          {
            value: 'opus',
            displayName: 'Opus',
            description: 'd',
            supportedEffortLevels: ['low', 'max'],
            supportsAutoMode: true,
          },
        ],
      }),
    });
    expect(await provider(ok.sdk).capabilities('/p')).toEqual({
      commands: [{ name: 'deploy', source: 'custom', description: 'Ship' }],
      models: [
        {
          id: 'opus',
          label: 'Opus',
          description: 'd',
          efforts: ['low', 'max'],
          supportsAutoMode: true,
        },
      ],
    });
    expect(ok.closed).toHaveBeenCalled();
    const bad = fakeSdk(() => undefined, {
      init: async () => {
        throw new Error('boom');
      },
    });
    expect(await provider(bad.sdk).capabilities('/p')).toEqual({
      commands: [],
      models: [],
    });
    vi.useFakeTimers();
    const slow = fakeSdk(() => undefined, {
      init: () => new Promise(() => undefined),
    });
    const pending = provider(slow.sdk).capabilities('/p');
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toEqual({ commands: [], models: [] });
    vi.useRealTimers();
  });

  it('passes runtime mode, model and effort to the query', async () => {
    const { sdk } = fakeSdk(() => undefined);
    const inner = sdk.query;
    const seen: Record<string, any>[] = [];
    sdk.query = (a) => {
      seen.push(a.options);
      return inner(a);
    };
    const s = await open(provider(sdk), {
      runtime: { permissionMode: 'fullAccess', model: 'opus', effort: 'high' },
    });
    expect(seen[0]).toMatchObject({
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      model: 'opus',
      effort: 'high',
    });
    s.close();
    const s2 = await open(provider(sdk), {
      runtime: { permissionMode: 'supervised' },
    });
    expect(seen[1]['permissionMode']).toBe('default');
    expect(seen[1]['model']).toBeUndefined();
    s2.close();
  });

  it('rejects a second prompt during a turn with busy', async () => {
    const { sdk } = fakeSdk(() => undefined);
    const s = await open(provider(sdk));
    void s.prompt('one').catch(() => undefined);
    await expect(s.prompt('two')).rejects.toMatchObject({ kind: 'busy' });
    s.close();
  });

  it('round-trips canUseTool through onPermission', async () => {
    let opts: Record<string, any> = {};
    const { sdk } = fakeSdk((o) => void (opts = o));
    const onPermission = vi.fn(async () => ({ allow: false as const }));
    const s = await open(provider(sdk), { onPermission });
    void s.prompt('x').catch(() => undefined);
    await vi.waitFor(() => expect(opts['canUseTool']).toBeTypeOf('function'));
    const res = await opts['canUseTool'](
      'Bash',
      { command: 'ls' },
      {
        signal: new AbortController().signal,
        toolUseID: 'tu',
      },
    );
    expect(res.behavior).toBe('deny');
    expect(onPermission).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'execute', toolUseId: 'tu' }),
    );
    const ac = new AbortController();
    ac.abort();
    onPermission.mockClear();
    const aborted = await opts['canUseTool']('Bash', {}, { signal: ac.signal });
    expect(aborted.behavior).toBe('deny');
    expect(onPermission).not.toHaveBeenCalled();
    s.close();
  });

  it('routes AskUserQuestion to onQuestion even in fullAccess', async () => {
    let opts: Record<string, any> = {};
    const { sdk } = fakeSdk((o) => void (opts = o));
    const onPermission = vi.fn(async () => ({ allow: true as const }));
    const onQuestion = vi.fn(async () => ({
      answered: true as const,
      answers: { 'Which?': 'A, B' },
    }));
    const s = await open(provider(sdk), {
      runtime: { permissionMode: 'fullAccess' },
      onPermission,
      onQuestion,
    });
    void s.prompt('x').catch(() => undefined);
    await vi.waitFor(() => expect(opts['canUseTool']).toBeTypeOf('function'));
    const input = {
      questions: [
        {
          question: 'Which?',
          header: 'Pick',
          multiSelect: true,
          options: [
            { label: 'A', description: 'a' },
            { label: 'B', description: 'b' },
          ],
        },
      ],
    };
    const res = await opts['canUseTool']('AskUserQuestion', input, {
      signal: new AbortController().signal,
      toolUseID: 'tu',
    });
    expect(res).toEqual({
      behavior: 'allow',
      updatedInput: { ...input, answers: { 'Which?': 'A, B' } },
    });
    expect(onQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        toolUseId: 'tu',
        questions: [expect.objectContaining({ question: 'Which?' })],
      }),
    );
    expect(onPermission).not.toHaveBeenCalled();
    expect(opts['disallowedTools'] ?? []).not.toContain('AskUserQuestion');

    onQuestion.mockResolvedValueOnce({
      answered: false,
      reason: 'skipped',
    } as never);
    const skipped = await opts['canUseTool']('AskUserQuestion', input, {
      signal: new AbortController().signal,
    });
    expect(skipped).toEqual({
      behavior: 'deny',
      message: 'The user skipped the questions.',
    });
    s.close();
  });

  it('close resolves pending questions as aborted', async () => {
    let opts: Record<string, any> = {};
    const { sdk } = fakeSdk((o) => void (opts = o));
    const s = await open(provider(sdk), {
      onQuestion: () => new Promise(() => undefined),
    });
    void s.prompt('x').catch(() => undefined);
    await vi.waitFor(() => expect(opts['canUseTool']).toBeDefined());
    const ask = opts['canUseTool'](
      'AskUserQuestion',
      { questions: [{ question: 'Q?', options: [] }] },
      { signal: new AbortController().signal },
    );
    s.close();
    expect(await ask).toMatchObject({
      behavior: 'deny',
      message: 'The request was aborted.',
    });
  });

  it('abort interrupts and denies pending asks', async () => {
    let opts: Record<string, any> = {};
    let interruptEmit = () => undefined as void;
    const { sdk, interrupt } = fakeSdk((o, emit) => {
      opts = o;
      interruptEmit = () => emit(result({ stop_reason: null }));
    });
    const s = await open(provider(sdk), {
      onPermission: () => new Promise(() => undefined),
    });
    const turn = s.prompt('x');
    await vi.waitFor(() => expect(opts['canUseTool']).toBeDefined());
    const ask = opts['canUseTool'](
      'Bash',
      {},
      { signal: new AbortController().signal },
    );
    interrupt.mockImplementation(async () => void interruptEmit());
    s.abort();
    expect((await ask).behavior).toBe('deny');
    expect(interrupt).toHaveBeenCalled();
    expect((await turn).stop).toBe('aborted');
    s.close();
  });

  it('maps an init failure to agentMissing', async () => {
    const { sdk } = fakeSdk(() => undefined, {
      init: async () => {
        throw Object.assign(new Error('spawn claude ENOENT'), {
          code: 'ENOENT',
        });
      },
    });
    await expect(open(provider(sdk))).rejects.toMatchObject({
      kind: 'agentMissing',
    });
    const p = provider(sdk, {
      loadSdk: async () => {
        throw new ChatError('agentMissing');
      },
    });
    await expect(open(p)).rejects.toMatchObject({ kind: 'agentMissing' });
  });

  it('resumes with the stored token', async () => {
    let opts: Record<string, any> = {};
    const { sdk } = fakeSdk((o) => void (opts = o));
    const s = await open(provider(sdk), { resumeToken: 'tok' });
    void s.prompt('x').catch(() => undefined);
    await vi.waitFor(() => expect(opts['resume']).toBe('tok'));
    expect(s.resumeToken).toBe('tok');
    s.close();
  });

  it('auth fast path and accountInfo path', async () => {
    const { sdk } = fakeSdk(() => undefined, {
      account: { email: 'a@b.c', subscriptionType: 'max' },
    });
    expect(
      await provider(sdk, {
        env: () => ({ ANTHROPIC_API_KEY: 'k' }),
      }).authStatus(),
    ).toEqual({ provider: 'claude', state: 'loggedIn' });
    expect(await provider(sdk).authStatus()).toEqual({
      provider: 'claude',
      state: 'loggedIn',
      account: { email: 'a@b.c', plan: 'max' },
    });
    const empty = fakeSdk(() => undefined).sdk;
    expect(await provider(empty).authStatus()).toEqual({
      provider: 'claude',
      state: 'loggedOut',
    });
  });

  it('auth status command decides login state', async () => {
    const { sdk } = fakeSdk(() => undefined, {
      account: { email: 'x@y.z' },
    });
    expect(
      await provider(sdk, {
        runAuthStatus: async () => ({
          code: 1,
          stdout: '{"loggedIn": false, "authMethod": "none"}',
        }),
      }).authStatus(),
    ).toEqual({ provider: 'claude', state: 'loggedOut' });
    expect(
      await provider(sdk, {
        runAuthStatus: async () => ({
          code: 0,
          stdout: '{"loggedIn": true, "email": "a@b.c"}',
        }),
      }).authStatus(),
    ).toMatchObject({
      state: 'loggedIn',
      account: { email: 'a@b.c' },
    });
    expect(
      await provider(sdk, {
        runAuthStatus: async () => ({ code: 0, stdout: 'garbage' }),
      }).authStatus(),
    ).toMatchObject({ state: 'loggedIn', account: { email: 'x@y.z' } });
    expect(
      await provider(sdk, {
        runAuthStatus: async () => {
          throw Object.assign(new Error('nope'), { code: 'ENOENT' });
        },
      }).authStatus(),
    ).toEqual({
      provider: 'claude',
      state: 'unavailable',
      error: 'agentMissing',
    });
  });

  it('login command runs /login on the binary', () => {
    expect(provider({}).loginCommand()).toEqual({
      file: 'claude',
      args: ['/login'],
    });
  });
});
