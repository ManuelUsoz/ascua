import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '@ascua/ipc';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) =>
      handlers.set(channel, fn),
  },
}));

import { registerChatIpc, type LoginTimers } from './chats-ipc';

const flush = () => new Promise((r) => setImmediate(r));

function setup(states: Array<'loggedIn' | 'loggedOut'>) {
  handlers.clear();
  let i = 0;
  const authStatus = vi.fn(async () => ({
    provider: 'claude' as const,
    state: states[Math.min(i++, states.length - 1)],
  }));
  const provider = {
    descriptor: { id: 'claude', enabled: true },
    authStatus,
    loginCommand: () => ({ file: 'claude', args: ['auth', 'login'] }),
  };
  let exit: (() => void) | undefined;
  const terminals = {
    openCommand: vi.fn(async () => ({ id: 'p1:shell-1', status: 'running' })),
    onExit: vi.fn((_id: string, cb: () => void) => {
      exit = cb;
    }),
  };
  const intervals: Array<() => void> = [];
  let timeoutFn: (() => void) | undefined;
  const timers: LoginTimers = {
    setInterval: (fn) => intervals.push(fn),
    clearInterval: vi.fn(),
    setTimeout: (fn) => {
      timeoutFn = fn;
      return 0;
    },
    clearTimeout: vi.fn(),
  };
  const send = vi.fn();
  registerChatIpc(
    {} as never,
    { get: () => provider } as never,
    terminals as never,
    send,
    async () => ({}),
    timers,
  );
  const login = () => handlers.get(IPC.chatProviderLogin)!({}, 'p1', 'claude');
  return {
    login,
    send,
    authStatus,
    intervals,
    timers,
    exit: () => exit?.(),
    timeout: () => timeoutFn?.(),
  };
}

describe('chat provider login watcher', () => {
  beforeEach(() => handlers.clear());

  it('re-checks and pushes when the login terminal exits', async () => {
    const t = setup(['loggedOut']);
    await t.login();
    t.exit();
    await flush();
    expect(t.authStatus).toHaveBeenCalledTimes(1);
    expect(t.send).toHaveBeenCalledWith(IPC.chatProviderAuthChanged, {
      provider: 'claude',
      state: 'loggedOut',
      final: true,
    });
  });

  it('pushes a final auth when the watch times out', async () => {
    const t = setup(['loggedOut']);
    await t.login();
    t.timeout();
    await flush();
    expect(t.send).toHaveBeenCalledTimes(1);
    expect(t.send).toHaveBeenCalledWith(IPC.chatProviderAuthChanged, {
      provider: 'claude',
      state: 'loggedOut',
      final: true,
    });
  });

  it('polls and stops at loggedIn', async () => {
    const t = setup(['loggedOut', 'loggedIn', 'loggedIn']);
    await t.login();
    t.intervals[0]();
    await flush();
    t.intervals[0]();
    await flush();
    t.intervals[0]();
    await flush();
    expect(t.send).toHaveBeenCalledTimes(2);
    expect(t.send).toHaveBeenLastCalledWith(IPC.chatProviderAuthChanged, {
      provider: 'claude',
      state: 'loggedIn',
      final: true,
    });
    expect(t.authStatus).toHaveBeenCalledTimes(2);
    expect(t.timers.clearInterval).toHaveBeenCalled();
  });
});

describe('resolve chat question', () => {
  function register() {
    handlers.clear();
    const service = { resolveQuestion: vi.fn() };
    registerChatIpc(
      service as never,
      { get: () => undefined } as never,
      {} as never,
      vi.fn(),
      async () => ({}),
      {
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
        setTimeout: vi.fn(() => 0),
        clearTimeout: vi.fn(),
      } as never,
    );
    const call = (answers: unknown) =>
      handlers.get(IPC.resolveChatQuestion)!({}, 'p1', 's1', 'q1', answers);
    return { service, call };
  }

  it('passes answers and skips through', () => {
    const { service, call } = register();
    expect(call({ 'Which?': 'A, B' })).toBeUndefined();
    expect(service.resolveQuestion).toHaveBeenLastCalledWith('p1', 's1', 'q1', {
      'Which?': 'A, B',
    });
    expect(call(null)).toBeUndefined();
    expect(service.resolveQuestion).toHaveBeenLastCalledWith(
      'p1',
      's1',
      'q1',
      null,
    );
  });

  it('rejects malformed answers', () => {
    const { service, call } = register();
    for (const bad of [
      undefined,
      'x',
      [],
      {},
      { q: 1 },
      { q: 'x'.repeat(4001) },
      { ['k'.repeat(2001)]: 'a' },
    ]) {
      expect(call(bad)).toEqual({ code: 'chat.invalidInput' });
    }
    expect(service.resolveQuestion).not.toHaveBeenCalled();
  });
});
