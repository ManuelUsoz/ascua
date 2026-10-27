import { TestBed } from '@angular/core/testing';
import type { ChatEvent, ChatSession, Message } from '@ascua/chat';
import { CLEAR_COMMAND, EMPTY_USAGE, NXY_COMMANDS } from '@ascua/chat';
import { ASCUA_API } from '../bridge/ascua-api';
import { ChatStore } from './chat-store';

const session: ChatSession = {
  id: 's1',
  projectId: 'p1',
  provider: 'claude',
  mode: 'chat',
  permissionMode: 'supervised',
  createdAt: 1,
  updatedAt: 1,
  status: 'idle',
  usage: EMPTY_USAGE,
};
const assistant: Message = {
  id: 'm1',
  sessionId: 's1',
  role: 'assistant',
  parts: [],
  createdAt: 2,
};
const ids = { sessionId: 's1', projectId: 'p1' };

describe('ChatStore', () => {
  let push: (e: ChatEvent) => void;
  let settingsChanged: (s: { chatProvider?: string }) => void;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function setup(): ChatStore {
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: api }],
    });
    return TestBed.inject(ChatStore);
  }

  beforeEach(() => {
    api = {
      listChatProviders: vi.fn(async () => [
        { id: 'claude', enabled: true, selected: false },
      ]),
      getSettings: vi.fn(async () => ({})),
      getChatProviderAuth: vi.fn(async () => ({
        provider: 'claude',
        state: 'loggedOut',
      })),
      selectChatProvider: vi.fn(async () => ({ chatProvider: 'claude' })),
      listChatSessions: vi.fn(async () => [session]),
      getChatTranscript: vi.fn(async () => ({ session, messages: [] })),
      startChat: vi.fn(async () => ({ ok: true, session })),
      listChatCommands: vi.fn(async () => [CLEAR_COMMAND, ...NXY_COMMANDS]),
      listChatModels: vi.fn(async () => ({ models: [] })),
      clearChat: vi.fn(async () => undefined),
      deleteChat: vi.fn(async () => undefined),
      updateChatSession: vi.fn(async () => undefined),
      onChatEvent: vi.fn((cb) => {
        push = cb;
        return () => undefined;
      }),
      onChatProviderAuthChanged: vi.fn(() => () => undefined),
      onSettingsChanged: vi.fn((cb) => {
        settingsChanged = cb;
        return () => undefined;
      }),
    };
  });

  it('clears loggingIn on a final loggedOut push and keeps auth', async () => {
    let authCb!: (a: unknown) => void;
    api['onChatProviderAuthChanged'].mockImplementation((cb) => {
      authCb = cb;
      return () => undefined;
    });
    api['loginChatProvider'] = vi.fn(async () => ({ id: 't1' }));
    const store = setup();
    await store.checkAuth('claude');
    await store.login('p1', 'claude');
    expect(store.loggingIn()).toBe(true);
    authCb({ provider: 'claude', state: 'loggedOut', final: true });
    expect(store.loggingIn()).toBe(false);
    expect(store.auth()?.state).toBe('loggedOut');
  });

  it('clears loggingIn when login returns an error', async () => {
    api['loginChatProvider'] = vi.fn(async () => ({ code: 'unknown' }));
    const store = setup();
    await store.login('p1', 'claude');
    expect(store.loggingIn()).toBe(false);
  });

  it('loads sessions and follows status events', async () => {
    const store = setup();
    await store.load('p1');
    expect(store.sessions('p1')).toEqual([session]);
    push({ ...ids, type: 'statusChanged', status: 'running' });
    expect(store.status('s1')).toBe('running');
  });

  it('folds events into the transcript and tracks permissions', async () => {
    const store = setup();
    await store.loadTranscript('p1', 's1');
    expect(store.transcript('s1')).toEqual([]);
    push({ ...ids, type: 'messageStarted', message: assistant });
    push({
      ...ids,
      type: 'messageDelta',
      messageId: 'm1',
      part: 'text',
      text: 'hola',
    });
    expect(store.transcript('s1')?.[0]?.parts).toEqual([
      { kind: 'text', text: 'hola' },
    ]);
    push({
      ...ids,
      type: 'permissionRequested',
      messageId: 'm1',
      request: { requestId: 'r1', tool: 'execute', title: 'ls' },
    });
    expect(store.pendingPermissions('s1').map((r) => r.requestId)).toEqual([
      'r1',
    ]);
    push({
      ...ids,
      type: 'permissionSettled',
      messageId: 'm1',
      requestId: 'r1',
      allowed: true,
    });
    expect(store.pendingPermissions('s1')).toEqual([]);
  });

  it('start returns the session or the error', async () => {
    const store = setup();
    expect(await store.start('p1', 'hi')).toEqual(session);
    expect(store.sessions('p1')).toEqual([session]);
    api['startChat'].mockResolvedValueOnce({
      ok: false,
      error: { code: 'chat.authRequired' },
    });
    expect(await store.start('p1', 'hi')).toEqual({
      code: 'chat.authRequired',
    });
  });

  it('applies events from an in-flight fetch without doubling text', async () => {
    const store = setup();
    let resolve!: (v: unknown) => void;
    api['getChatTranscript'].mockReturnValueOnce(
      new Promise((r) => (resolve = r)),
    );
    const loading = store.loadTranscript('p1', 's1');
    const delta = (text: string): ChatEvent => ({
      ...ids,
      type: 'messageDelta',
      messageId: 'm1',
      part: 'text',
      text,
    });
    push(delta('ho'));
    push({
      ...ids,
      type: 'messageStarted',
      message: { ...assistant, id: 'm2' },
    });
    push({
      ...ids,
      type: 'messageDelta',
      messageId: 'm2',
      part: 'text',
      text: 'x',
    });
    resolve({
      session,
      messages: [{ ...assistant, parts: [{ kind: 'text', text: 'ho' }] }],
    });
    await loading;
    const msgs = store.transcript('s1');
    expect(msgs?.[0]?.parts).toEqual([{ kind: 'text', text: 'ho' }]);
    expect(msgs?.[1]?.parts).toEqual([{ kind: 'text', text: 'x' }]);
  });

  it('shows events that arrive before start resolves', async () => {
    const store = setup();
    api['startChat'].mockImplementationOnce(async () => {
      push({ ...ids, type: 'messageStarted', message: assistant });
      push({
        ...ids,
        type: 'messageDelta',
        messageId: 'm1',
        part: 'text',
        text: 'hey',
      });
      return { ok: true, session };
    });
    api['getChatTranscript'].mockReturnValueOnce(new Promise(() => undefined));
    await store.start('p1', 'hi');
    expect(store.transcript('s1')?.[0]?.parts).toEqual([
      { kind: 'text', text: 'hey' },
    ]);
  });

  it('empties the transcript on transcriptCleared', async () => {
    const store = setup();
    await store.loadTranscript('p1', 's1');
    push({ ...ids, type: 'messageStarted', message: assistant });
    expect(store.transcript('s1')).toHaveLength(1);
    push({ ...ids, type: 'transcriptCleared' });
    expect(store.transcript('s1')).toEqual([]);
  });

  it('loads the commands per project and passes the session along', async () => {
    const store = setup();
    const names = ['clear', 'locate', 'make', 'review'];
    // Builtin and nxy show before the provider probe answers.
    expect(store.commands('p1').map((c) => c.name)).toEqual(names);
    await store.loadCommands('p1', 's1');
    expect(api['listChatCommands']).toHaveBeenCalledWith('p1', 's1');
    expect(store.commands('p1').map((c) => c.name)).toEqual(names);
  });

  it('tracks capability loading and skips already loaded projects', async () => {
    const store = setup();
    expect(store.capabilitiesLoading('p1')).toBe(false);
    const pending = store.loadCommands('p1');
    expect(store.capabilitiesLoading('p1')).toBe(true);
    await pending;
    expect(store.capabilitiesLoading('p1')).toBe(false);
    await store.loadCommands('p1');
    expect(api['listChatCommands']).toHaveBeenCalledTimes(1);
    await store.loadModels('p1');
    await store.loadModels('p1');
    expect(api['listChatModels']).toHaveBeenCalledTimes(1);
  });

  it('capabilitiesChanged updates commands and models', async () => {
    const store = setup();
    await store.load('p1');
    push({
      type: 'capabilitiesChanged',
      ...ids,
      commands: [{ name: 'deploy', source: 'custom', description: 'd' }],
      models: [{ id: 'opus', efforts: [] }],
    } as ChatEvent);
    expect(store.commands('p1').map((c) => c.name)).toContain('deploy');
    expect(store.models('p1')?.models.map((m) => m.id)).toEqual(['opus']);
  });

  it('finds a session by id and follows sessionUpdated', async () => {
    const store = setup();
    await store.load('p1');
    expect(store.session('p1', 's1')).toEqual(session);
    expect(store.session('p1', 'missing')).toBeUndefined();
    push({
      ...ids,
      type: 'sessionUpdated',
      session: { ...session, permissionMode: 'auto' },
    });
    expect(store.session('p1', 's1')?.permissionMode).toBe('auto');
  });

  it('clear and update forward to main and return its error', async () => {
    const store = setup();
    expect(await store.clear('p1', 's1')).toBeUndefined();
    expect(api['clearChat']).toHaveBeenCalledWith('p1', 's1');
    api['updateChatSession'].mockResolvedValueOnce({ code: 'chat.notFound' });
    expect(await store.update('p1', 's1', { permissionMode: 'auto' })).toEqual({
      code: 'chat.notFound',
    });
    expect(api['updateChatSession']).toHaveBeenCalledWith('p1', 's1', {
      permissionMode: 'auto',
    });
  });

  it('resolveQuestion forwards answers or a skip and returns errors', async () => {
    const store = setup();
    api['resolveChatQuestion'] = vi.fn(async () => undefined);
    expect(
      await store.resolveQuestion('p1', 's1', 'q1', { 'Which?': 'A' }),
    ).toBeUndefined();
    expect(api['resolveChatQuestion']).toHaveBeenLastCalledWith(
      'p1',
      's1',
      'q1',
      { 'Which?': 'A' },
    );
    api['resolveChatQuestion'].mockResolvedValueOnce({
      code: 'chat.notFound',
    });
    expect(await store.resolveQuestion('p1', 's1', 'q1', null)).toEqual({
      code: 'chat.notFound',
    });
    expect(api['resolveChatQuestion']).toHaveBeenLastCalledWith(
      'p1',
      's1',
      'q1',
      null,
    );
    api['resolveChatQuestion'].mockRejectedValueOnce(new Error('x'));
    expect(await store.resolveQuestion('p1', 's1', 'q1', null)).toBeDefined();
  });

  it('remove and sessionRemoved drop the session', async () => {
    const store = setup();
    await store.load('p1');
    expect(await store.remove('p1', 's1')).toBeUndefined();
    expect(api['deleteChat']).toHaveBeenCalledWith('p1', 's1');
    expect(store.sessions('p1')).toEqual([]);
    await store.load('p1');
    expect(store.sessions('p1')).toEqual([session]);
    push({ ...ids, type: 'sessionRemoved' });
    push({ ...ids, type: 'sessionRemoved' });
    expect(store.sessions('p1')).toEqual([]);
  });

  it('start passes the permission mode to main', async () => {
    const store = setup();
    await store.start('p1', 'hi', { permissionMode: 'auto' });
    expect(api['startChat']).toHaveBeenCalledWith('p1', 'hi', {
      permissionMode: 'auto',
    });
  });

  it('start without the desktop gives noDesktop', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: undefined }],
    });
    const store = TestBed.inject(ChatStore);
    expect(await store.start('p1', 'hi')).toEqual({ code: 'noDesktop' });
  });

  it('runs the provider auth and select flow', async () => {
    const store = setup();
    await store.loadProviders();
    expect(store.providers()).toHaveLength(1);
    expect(store.selectedProvider()).toBeUndefined();
    const auth = await store.checkAuth('claude');
    expect(auth?.state).toBe('loggedOut');
    expect(store.auth()?.state).toBe('loggedOut');
    expect(await store.select('claude')).toBeUndefined();
    expect(store.selectedProvider()).toBe('claude');
    expect(store.providers()[0]?.selected).toBe(true);
    settingsChanged({});
    expect(store.selectedProvider()).toBeUndefined();
  });
});
