import { describe, expect, it, vi } from 'vitest';
import { ChatError, type AgentEvent, type OpenOptions } from '@ascua/chat';
import { ClaudeProvider } from './claude-provider';

type Msg = Record<string, unknown>;

/** A scripted fake `query`: `script(input, opts)` yields messages per user prompt. */
function fakeSdk(
  script: (
    opts: Record<string, any>,
    emit: (m: Msg) => void,
  ) => void | Promise<void>,
  extra: Partial<{ init: () => Promise<unknown>; account: object }> = {},
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
    exists: () => false,
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
    onEvent: (e) => events.push(e),
    onPermission: async () => ({ allow: true }),
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
    expect(events[0]).toMatchObject({ type: 'messageDelta', text: 'a' });
    // second turn reports the cost delta
    const r2 = await s.prompt('again');
    expect(r2.usage.costUsd).toBeCloseTo(0);
    s.close();
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

  it('login command runs /login on the binary', () => {
    expect(provider({}).loginCommand()).toEqual({
      file: 'claude',
      args: ['/login'],
    });
  });
});
