import { describe, expect, it } from 'vitest';
import {
  ChatError,
  type AgentProvider,
  type ChatCommand,
  type ChatEvent,
  type ChatSessionRecord,
  type ChatSessionStore,
  type McpServerSpec,
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
import { LOCATE_MODE, MAKE_MODE, REVIEW_MODE } from './harness/nxy-modes';
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
  async remove(p: string, id: string) {
    this.dir(p).delete(id);
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
    opens: [] as OpenOptions[],
    probes: 0,
    failProbe: false,
    modes: [] as string[],
    probed: [] as ChatCommand[],
  };
  const provider: AgentProvider = {
    descriptor: { id: 'claude', enabled: true },
    authStatus: async () => ({ provider: 'claude', state: 'loggedIn' }),
    loginCommand: () => undefined,
    capabilities: async () => {
      state.probes++;
      if (state.failProbe) throw new Error('boom');
      return { commands: state.probed, models: [] };
    },
    open: async (o) => {
      state.opens.push(o);
      if (openError) throw openError;
      const session: ProviderSession = {
        resumeToken: 'tok',
        prompt: () => {
          const release = new Promise<void>((r) => (state.release = r));
          return script(o, release);
        },
        setPermissionMode: async (m) => void state.modes.push(m),
        abort: () => void state.aborted++,
        close: () => void state.closed++,
      };
      return session;
    },
  };
  return { provider, state };
}

function setup(
  script: Script,
  openError?: Error,
  mcpServers?: (
    projectId: string,
    cwd: string,
  ) => McpServerSpec[] | Promise<McpServerSpec[]>,
) {
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
    harness: new HarnessHost([
      DIRECT_MODE,
      LOCATE_MODE,
      MAKE_MODE,
      REVIEW_MODE,
    ]),
    projects: {
      get: async (id: string) =>
        id === 'p1' ? (project as Project) : undefined,
    } as never,
    bus: { publish: (e) => void events.push(e) },
    ids: () => `id${++n}`,
    now: () => 1000 + n,
    mcpServers,
  });
  return { service, store, ledger, events, state };
}

const SUP = { permissionMode: 'supervised' } as const;
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
    const session = await service.start('p1', 'a', SUP);
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
    const session = await service.start('p1', 'a', SUP);
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
    const session = await service.start('p1', 'a', SUP);
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

  const idle = (events: ChatEvent[]) => () =>
    (lastStatus(events) as { status: string } | undefined)?.status === 'idle';

  const askEdit =
    (decisions: PermissionDecision[]): Script =>
    async (o) => {
      decisions.push(
        await o.onPermission({ requestId: 'r1', tool: 'edit', title: 'Edit' }),
      );
      return { stop: 'endTurn', usage };
    };

  it('new chats default to fullAccess and approve without a card', async () => {
    const decisions: PermissionDecision[] = [];
    const { service, events, state } = setup(askEdit(decisions));
    const session = await service.start('p1', 'a');
    await until(idle(events));
    expect(session.permissionMode).toBe('fullAccess');
    expect(state.opens[0].runtime.permissionMode).toBe('fullAccess');
    expect(decisions).toEqual([{ allow: true }]);
    expect(types(events)).not.toContain('permissionRequested');
  });

  it('open receives the mcp specs from the dependency', async () => {
    const spec = { name: 'x', command: 'node', args: ['a'] };
    const seen: string[][] = [];
    const { service, events, state } = setup(
      streaming,
      undefined,
      (id, cwd) => {
        seen.push([id, cwd]);
        return [spec];
      },
    );
    await service.start('p1', 'a');
    await until(idle(events));
    expect(state.opens[0].mcpServers).toEqual([spec]);
    expect(seen[0][0]).toBe('p1');
  });

  it('open awaits async mcp specs resolved from the project, not cwd', async () => {
    const spec = { name: 'x', command: 'node', args: ['/indexed/root'] };
    const { service, events, state } = setup(
      streaming,
      undefined,
      async (id) => (id === 'p1' ? [spec] : []),
    );
    await service.start('p1', 'a');
    await until(idle(events));
    expect(state.opens[0].mcpServers).toEqual([spec]);
  });

  it('open gets no mcp specs when the dependency throws', async () => {
    const { service, events, state } = setup(streaming, undefined, () => {
      throw new Error('boom');
    });
    await service.start('p1', 'a');
    await until(idle(events));
    expect(state.opens[0].mcpServers).toEqual([]);
  });

  it('supervised and auto still ask the user', async () => {
    for (const permissionMode of ['supervised', 'auto'] as const) {
      const { service, events } = setup(askEdit([]));
      await service.start('p1', 'a', { permissionMode });
      await until(() => types(events).includes('permissionRequested'));
    }
  });

  it('acceptEdits allows edits but asks for other tools', async () => {
    const decisions: PermissionDecision[] = [];
    const { service, events } = setup(async (o) => {
      decisions.push(
        await o.onPermission({ requestId: 'r1', tool: 'edit', title: 'Edit' }),
      );
      decisions.push(
        await o.onPermission({ requestId: 'r2', tool: 'execute', title: 'B' }),
      );
      return { stop: 'endTurn', usage };
    });
    await service.start('p1', 'a', { permissionMode: 'acceptEdits' });
    await until(() => types(events).includes('permissionRequested'));
    expect(decisions).toEqual([{ allow: true }]);
  });

  it('switching to fullAccess settles pending permissions and updates the live session', async () => {
    const decisions: PermissionDecision[] = [];
    const { service, events } = setup(askEdit(decisions));
    const session = await service.start('p1', 'a', SUP);
    await until(() => types(events).includes('permissionRequested'));
    await service.update('p1', session.id, { permissionMode: 'fullAccess' });
    await until(() => decisions.length === 1);
    expect(decisions[0]).toEqual({ allow: true });
  });

  it('switching to acceptEdits settles only pending edits', async () => {
    const decisions: PermissionDecision[] = [];
    const { service, events } = setup(async (o) => {
      decisions.push(
        await o.onPermission({ requestId: 'r1', tool: 'execute', title: 'B' }),
      );
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a', SUP);
    await until(() => types(events).includes('permissionRequested'));
    await service.update('p1', session.id, { permissionMode: 'acceptEdits' });
    await tick();
    expect(decisions).toEqual([]);
  });

  it('calls setPermissionMode on the live provider session', async () => {
    const { service, events, state } = setup(streaming);
    const session = await service.start('p1', 'a', SUP);
    await until(idle(events));
    await service.update('p1', session.id, { permissionMode: 'auto' });
    expect(state.modes).toEqual(['auto']);
  });

  it('a model change while running is busy', async () => {
    const { service, state } = setup(async (_o, release) => {
      await release;
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a');
    await expect(
      service.update('p1', session.id, { model: 'opus' }),
    ).rejects.toMatchObject({ kind: 'busy' });
    state.release();
  });

  it('a model or effort change while idle drops the provider session', async () => {
    const { service, state, events } = setup(streaming);
    const session = await service.start('p1', 'a');
    await until(idle(events));
    await service.update('p1', session.id, { model: 'opus', effort: 'high' });
    expect(state.closed).toBe(1);
    await service.send('p1', session.id, 'again');
    await until(() => state.opens.length === 2);
    expect(state.opens[1].resumeToken).toBe('tok');
    expect(state.opens[1].runtime).toMatchObject({
      model: 'opus',
      effort: 'high',
    });
    await until(idle(events));
    await service.update('p1', session.id, { model: null });
    expect(
      (await service.transcript('p1', session.id))?.session.model,
    ).toBeUndefined();
  });

  it('a same-value model or effort patch does not drop the session', async () => {
    const { service, state, events } = setup(streaming);
    const session = await service.start('p1', 'a', {
      model: 'sonnet',
      effort: 'low',
    });
    await until(idle(events));
    await service.update('p1', session.id, { model: 'sonnet', effort: 'low' });
    expect(state.closed).toBe(0);
  });

  it('start stores model and effort', async () => {
    const { service } = setup(streaming);
    const session = await service.start('p1', 'a', {
      model: 'sonnet',
      effort: 'low',
    });
    expect(session).toMatchObject({ model: 'sonnet', effort: 'low' });
  });

  it('sessionInfo emits capabilitiesChanged and feeds the caches', async () => {
    const { service, events } = setup(async (o) => {
      o.onEvent({
        type: 'sessionInfo',
        commands: [{ name: 'deploy', source: 'custom' }],
        models: [{ id: 'm1', efforts: [] }],
      });
      return { stop: 'endTurn', usage };
    });
    await service.start('p1', 'a');
    await until(idle(events));
    const ev = events.find((e) => e.type === 'capabilitiesChanged') as {
      commands: ChatCommand[];
      models: unknown[];
    };
    expect(ev.commands.map((c) => c.name)).toContain('deploy');
    expect(ev.models).toHaveLength(1);
    expect((await service.models('p1')).source).toBe('live');
  });

  it('models fall back to the static catalog', async () => {
    const { service } = setup(streaming);
    const catalog = await service.models('p1');
    expect(catalog.source).toBe('static');
    expect(catalog.provider).toBe('claude');
    expect(catalog.models.length).toBeGreaterThan(0);
  });

  it('concurrent commands() and models() share one capabilities call', async () => {
    const { service, state } = setup(streaming);
    await Promise.all([service.commands('p1'), service.models('p1')]);
    expect(state.probes).toBe(1);
  });

  it('warm() then models() calls capabilities once', async () => {
    const { service, state } = setup(streaming);
    service.warm('p1');
    await service.models('p1');
    expect(state.probes).toBe(1);
  });

  it('a throwing provider still returns the static catalog', async () => {
    const { service, state } = setup(streaming);
    state.failProbe = true;
    const catalog = await service.models('p1');
    expect(catalog.source).toBe('static');
    expect(await service.commands('p1')).toBeDefined();
  });

  it('a failed probe is not cached: the next call retries', async () => {
    const { service, state } = setup(streaming);
    state.failProbe = true;
    await service.models('p1');
    state.failProbe = false;
    await service.models('p1');
    expect(state.probes).toBe(2);
  });

  it('capabilitiesChanged is visible to an immediate models() call', async () => {
    const { service, events } = setup(async (o) => {
      o.onEvent({ type: 'sessionInfo', models: [{ id: 'm1', efforts: [] }] });
      return { stop: 'endTurn', usage };
    });
    await service.start('p1', 'a');
    await until(() => events.some((e) => e.type === 'capabilitiesChanged'));
    expect((await service.models('p1')).source).toBe('live');
  });

  it('/make x sets the mode and reopens the provider', async () => {
    const { service, store, state, events } = setup(streaming);
    const session = await service.start('p1', 'hi');
    await until(idle(events));
    await service.send('p1', session.id, '/make do x');
    await until(() => state.opens.length === 2);
    expect(state.closed).toBe(1);
    expect(state.opens[1].resumeToken).toBe('tok');
    expect(state.opens[1].turn.systemAppend).toContain('make');
    const saved = await store.get('p1', session.id);
    expect(saved?.mode).toBe('make');
  });

  it('/make x while a run is active throws busy and changes nothing', async () => {
    const { service, store, state, events } = setup(async (o) => {
      await o.onPermission({ requestId: 'r1', tool: 'edit', title: 'Edit' });
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a', SUP);
    await until(() => types(events).includes('permissionRequested'));
    await expect(service.send('p1', session.id, '/make x')).rejects.toThrow();
    expect(state.closed).toBe(0);
    expect((await store.get('p1', session.id))?.mode).not.toBe('make');
  });

  it('/make alone only switches the mode', async () => {
    const { service, store, state, events } = setup(streaming);
    const session = await service.start('p1', 'hi');
    await until(idle(events));
    const before = events.length;
    await service.send('p1', session.id, '/make');
    expect((await store.get('p1', session.id))?.mode).toBe('make');
    expect(events.slice(before).map((e) => e.type)).toEqual(['sessionUpdated']);
    expect(state.opens).toHaveLength(1);
    expect((await store.get('p1', session.id))?.messages).toHaveLength(2);
  });

  it('clear empties the transcript and drops the resume token', async () => {
    const { service, store, state, events } = setup(streaming);
    const session = await service.start('p1', 'hi');
    await until(idle(events));
    await service.clear('p1', session.id);
    expect(types(events)).toContain('transcriptCleared');
    const saved = await store.get('p1', session.id);
    expect(saved?.messages).toEqual([]);
    expect(saved?.resumeToken).toBeUndefined();
    await service.send('p1', session.id, 'again');
    await until(() => state.opens.length === 2);
    expect(state.opens[1].resumeToken).toBeUndefined();
  });

  it('clear is busy while running', async () => {
    const { service, state } = setup(async (_o, release) => {
      await release;
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a');
    await expect(service.clear('p1', session.id)).rejects.toMatchObject({
      kind: 'busy',
    });
    state.release();
  });

  it('remove deletes the record and publishes sessionRemoved', async () => {
    const { service, store, events } = setup(streaming);
    const session = await service.start('p1', 'hi');
    await until(idle(events));
    await service.remove('p1', session.id);
    expect(await store.get('p1', session.id)).toBeUndefined();
    expect(types(events)).toContain('sessionRemoved');
  });

  it('remove of a running chat does not let late events resave it', async () => {
    const { service, store, state } = setup(async (o, release) => {
      await release;
      o.onEvent({ type: 'messageDelta', part: 'text', text: 'late' });
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a');
    await service.remove('p1', session.id);
    state.release();
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.get('p1', session.id)).toBeUndefined();
  });

  it('remove of an unknown id is notFound', async () => {
    const { service } = setup(streaming);
    await expect(service.remove('p1', 'nope')).rejects.toMatchObject({
      kind: 'notFound',
    });
  });

  it('the init model updates the session', async () => {
    const { service, events } = setup(async (o) => {
      o.onEvent({ type: 'sessionInfo', model: 'opus' });
      return { stop: 'endTurn', usage };
    });
    const session = await service.start('p1', 'a');
    await until(idle(events));
    const t = await service.transcript('p1', session.id);
    expect(t?.session.resolvedModel).toBe('opus');
  });

  it('commands merge the builtin, nxy and custom ones without duplicates', async () => {
    const { service, state } = setup(streaming);
    state.probed = [
      { name: 'clear', source: 'custom' },
      { name: 'deploy', source: 'custom' },
    ];
    const names = (await service.commands('p1')).map((c) => c.name);
    expect(names).toEqual(['clear', 'locate', 'make', 'review', 'deploy']);
    await service.commands('p1');
    expect(state.probes).toBe(1);
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
