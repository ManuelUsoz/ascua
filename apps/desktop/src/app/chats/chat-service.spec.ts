import { describe, expect, it } from 'vitest';
import {
  ChatError,
  type AgentProvider,
  type ChatEvent,
  type ChatSessionRecord,
  type ChatSessionStore,
  type OpenOptions,
  type PermissionDecision,
  type ProviderSession,
  type TurnResult,
  type UsageEntry,
  type UsageLedger,
  DIRECT_MODE,
  addUsage,
  EMPTY_USAGE,
} from '@ascua/chat';
import type { Project } from '@ascua/ipc';
import { ChatService } from './chat-service';
import { HarnessHost } from './harness/harness-host';
import { ProviderRegistry } from './provider-registry';

const project = { id: 'p1', name: 'Demo', path: '/demo', terminals: [] };
const usage = {
  ...EMPTY_USAGE,
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.5,
};

class MemStore implements ChatSessionStore {
  files = new Map<string, Map<string, ChatSessionRecord>>();
  private dir(p: string) {
    let d = this.files.get(p);
    if (!d) this.files.set(p, (d = new Map()));
    return d;
  }
  async list(p: string) {
    return structuredClone([...this.dir(p).values()]);
  }
  async get(p: string, id: string) {
    const r = this.dir(p).get(id);
    return r && structuredClone(r);
  }
  async save(r: ChatSessionRecord) {
    this.dir(r.projectId).set(r.id, structuredClone(r));
  }
  async appendMessage(
    p: string,
    id: string,
    m: ChatSessionRecord['messages'][0],
  ) {
    this.dir(p).get(id)?.messages.push(structuredClone(m));
  }
  async removeProject(p: string) {
    this.files.delete(p);
  }
}

class MemLedger implements UsageLedger {
  items: UsageEntry[] = [];
  async record(e: UsageEntry) {
    this.items.push(e);
  }
  async totals() {
    return {
      usage: this.items.reduce((a, e) => addUsage(a, e.usage), EMPTY_USAGE),
      turns: this.items.length,
    };
  }
  async entries() {
    return this.items;
  }
}

interface Script {
  (o: OpenOptions, release: Promise<void>): Promise<TurnResult>;
}

function fakeProvider(script: Script, openError?: Error) {
  const state = {
    closed: 0,
    aborted: 0,
    release: () => undefined as void,
    decisions: [] as PermissionDecision[],
  };
  const provider: AgentProvider = {
    descriptor: { id: 'claude', enabled: true },
    authStatus: async () => ({ provider: 'claude', state: 'loggedIn' }),
    loginCommand: () => undefined,
    open: async (o) => {
      if (openError) throw openError;
      const session: ProviderSession = {
        resumeToken: 'tok',
        prompt: () => {
          const release = new Promise<void>((r) => (state.release = r));
          return script(o, release);
        },
        abort: () => void state.aborted++,
        close: () => void state.closed++,
      };
      return session;
    },
  };
  return { provider, state };
}

function setup(script: Script, openError?: Error) {
  const { provider, state } = fakeProvider(script, openError);
  const store = new MemStore();
  const ledger = new MemLedger();
  const events: ChatEvent[] = [];
  let n = 0;
  const service = new ChatService({
    store,
    ledger,
    registry: new ProviderRegistry({
      providers: { claude: provider },
      settings: {
        get: async () => ({ chatProvider: 'claude' as const }),
        update: async () => undefined,
      },
    }),
    harness: new HarnessHost([DIRECT_MODE]),
    projects: {
      get: async (id: string) =>
        id === 'p1' ? (project as Project) : undefined,
    } as never,
    bus: { publish: (e) => void events.push(e) },
    ids: () => `id${++n}`,
    now: () => 1000 + n,
  });
  return { service, store, ledger, events, state };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(cond: () => boolean) {
  for (let i = 0; i < 100 && !cond(); i++) await tick();
  expect(cond()).toBe(true);
}
const types = (events: ChatEvent[]) => events.map((e) => e.type);
const lastStatus = (events: ChatEvent[]) =>
  [...events].reverse().find((e) => e.type === 'statusChanged');

const streaming: Script = async (o) => {
  o.onEvent({ type: 'messageDelta', part: 'text', text: 'Hel' });
  o.onEvent({ type: 'messageDelta', part: 'text', text: 'lo' });
  o.onEvent({ type: 'usage', usage, stop: 'endTurn' });
  return { stop: 'endTurn', usage };
};

describe('ChatService', () => {
  it('streams events in order and persists both messages', async () => {
    const { service, store, events } = setup(streaming);
    const session = await service.start('p1', 'hi there');
    expect(session.title).toBe('hi there');
    await until(
      () =>
        lastStatus(events)?.type === 'statusChanged' &&
        (lastStatus(events) as { status: string }).status === 'idle',
    );
    expect(types(events)).toEqual([
      'messageStarted',
      'messageStarted',
      'statusChanged',
      'messageDelta',
      'messageDelta',
      'messageCompleted',
      'sessionUpdated',
      'statusChanged',
    ]);
    const saved = await store.get('p1', session.id);
    expect(saved?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(saved?.messages[1].parts).toEqual([{ kind: 'text', text: 'Hello' }]);
    expect(saved?.resumeToken).toBe('tok');
  });

  it('records usage once in the ledger and on the session', async () => {
    const { service, ledger, events } = setup(streaming);
    const session = await service.start('p1', 'hi');
    await until(() => types(events).includes('sessionUpdated'));
    expect(ledger.items).toHaveLength(1);
    const [list] = await service.list('p1');
    expect(list.id).toBe(session.id);
    expect(list.usage.inputTokens).toBe(10);
    expect(list.usage.costUsd).toBe(0.5);
  });

  it('a failure after completion adds no second message or usage', async () => {
    const { service, store, ledger, events } = setup(streaming);
    const save = store.save.bind(store);
    const attempts: number[] = [];
    store.save = async (r) => {
      if (r.usage.inputTokens > 0) {
        attempts.push(r.messages.filter((m) => m.role === 'assistant').length);
        throw new Error('disk full');
      }
      return save(r);
    };
    await service.start('p1', 'hi');
    await until(
      () => (lastStatus(events) as { status: string }).status === 'failed',
    );
    expect(ledger.items).toHaveLength(1);
    expect(attempts).toEqual([1]);
    expect(events.filter((e) => e.type === 'messageCompleted')).toHaveLength(0);
  });

  it('refuses a second prompt while running and shows the in-flight transcript', async () => {
    const { service, state, events } = setup(async (o, release) => {
      o.onEvent({ type: 'messageDelta', part: 'text', text: 'partial' });
      await release;
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a');
    await expect(service.send('p1', session.id, 'b')).rejects.toMatchObject({
      kind: 'busy',
    });
    const t = await service.transcript('p1', session.id);
    expect(t?.messages[1].parts).toEqual([{ kind: 'text', text: 'partial' }]);
    state.release();
    await until(
      () => (lastStatus(events) as { status: string }).status === 'idle',
    );
    await service.send('p1', session.id, 'c');
  });

  it('settles an allowed permission and the turn continues', async () => {
    const decisions: PermissionDecision[] = [];
    const { service, events } = setup(async (o) => {
      decisions.push(
        await o.onPermission({
          requestId: 'r1',
          tool: 'execute',
          title: 'Bash',
        }),
      );
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a');
    await until(() => types(events).includes('permissionRequested'));
    expect((lastStatus(events) as { status: string }).status).toBe(
      'awaitingPermission',
    );
    service.resolvePermission('p1', session.id, 'r1', true);
    await until(() => types(events).includes('messageCompleted'));
    expect(decisions).toEqual([{ allow: true }]);
    expect(types(events)).toContain('permissionSettled');
  });

  it('delivers a deny to the provider', async () => {
    const decisions: PermissionDecision[] = [];
    const { service, events } = setup(async (o) => {
      decisions.push(
        await o.onPermission({ requestId: 'r1', tool: 'edit', title: 'Edit' }),
      );
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a');
    await until(() => types(events).includes('permissionRequested'));
    service.resolvePermission('p1', session.id, 'r1', false);
    await until(() => decisions.length === 1);
    expect(decisions[0]).toEqual({ allow: false, reason: 'denied' });
  });

  it('gives notFound for an unknown or foreign request', async () => {
    const { service } = setup(streaming);
    expect(() => service.resolvePermission('p1', 's', 'nope', true)).toThrow(
      ChatError,
    );
  });

  it('abort denies a pending request', async () => {
    const decisions: PermissionDecision[] = [];
    const { service, events, state } = setup(async (o) => {
      decisions.push(
        await o.onPermission({
          requestId: 'r1',
          tool: 'execute',
          title: 'Bash',
        }),
      );
      return { stop: 'aborted', usage };
    });
    const session = await service.start('p1', 'a');
    await until(() => types(events).includes('permissionRequested'));
    service.abort('p1', session.id);
    await until(() => decisions.length === 1);
    expect(decisions[0]).toEqual({ allow: false, reason: 'aborted' });
    expect(state.aborted).toBe(1);
    expect(() =>
      service.resolvePermission('p1', session.id, 'r1', true),
    ).toThrow();
  });

  it('reports authRequired as a failed status with an error part', async () => {
    const { service, events, store } = setup(
      streaming,
      new ChatError('authRequired'),
    );
    const session = await service.start('p1', 'a');
    await until(() => types(events).includes('error'));
    expect(lastStatus(events)).toMatchObject({
      status: 'failed',
      error: 'authRequired',
    });
    const saved = await store.get('p1', session.id);
    expect(saved?.status).toBe('failed');
    expect(saved?.messages[1].parts).toContainEqual({
      kind: 'error',
      code: 'authRequired',
    });
  });

  it('removing the project closes the session and deletes the file', async () => {
    const { service, store, state, events } = setup(async (_o, release) => {
      await release;
      return { stop: 'aborted', usage };
    });
    const session = await service.start('p1', 'a');
    await until(() => types(events).includes('statusChanged'));
    await tick();
    await service.removedProject('p1');
    expect(state.closed).toBe(1);
    expect(store.files.has('p1')).toBe(false);
    state.release();
    await tick();
    expect(await store.get('p1', session.id)).toBeUndefined();
  });
});
