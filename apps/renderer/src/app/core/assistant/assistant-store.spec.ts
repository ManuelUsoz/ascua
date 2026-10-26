import { TestBed } from '@angular/core/testing';
import type { AssistantEvent } from '@ascua/assistant';
import { encodeError } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { Companion } from '../companion/companion';
import { AssistantStore } from './assistant-store';

describe('AssistantStore', () => {
  let emit: (event: AssistantEvent) => void;
  let unsubscribe: ReturnType<typeof vi.fn>;
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let work: ReturnType<typeof vi.fn>;

  function setup(value: unknown = api): AssistantStore {
    work = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: ASCUA_API, useValue: value },
        { provide: Companion, useValue: { work } },
      ],
    });
    return TestBed.inject(AssistantStore);
  }

  beforeEach(() => {
    unsubscribe = vi.fn();
    api = {
      assistantStatus: vi.fn(async () => ({
        status: { state: 'ready' },
        messages: [],
      })),
      assistantSend: vi.fn(async () => undefined),
      assistantCancel: vi.fn(async () => undefined),
      assistantReset: vi.fn(async () => undefined),
      onAssistantEvent: vi.fn((cb) => {
        emit = cb;
        return unsubscribe;
      }),
    };
  });

  it('streams text, tools and drives the avatar', async () => {
    const store = setup();
    await store.load();
    expect(store.status()).toEqual({ state: 'ready' });
    emit({ type: 'turnStarted', turn: 't1', text: 'hola' });
    expect(store.busy()).toBe(true);
    emit({
      type: 'toolStarted',
      turn: 't1',
      callId: 'c1',
      tool: 'projects_list',
    });
    emit({ type: 'toolFinished', turn: 't1', callId: 'c1', ok: true });
    emit({ type: 'text', turn: 't1', delta: 'Tienes ' });
    emit({ type: 'text', turn: 't1', delta: 'uno.' });
    emit({ type: 'turnDone', turn: 't1', outcome: 'done' });
    const [user, reply] = store.messages();
    expect(user.text).toBe('hola');
    expect(reply.text).toBe('Tienes uno.');
    expect(reply.tools[0]).toMatchObject({
      tool: 'projects_list',
      state: 'ok',
    });
    expect(store.busy()).toBe(false);
    expect(work.mock.calls.map((c) => c[0])).toEqual([
      'think',
      'read',
      'think',
      null,
    ]);
  });

  it('warm asks main to prespawn and swallows failures', async () => {
    api['assistantWarm'] = vi.fn(async () => {
      throw new Error('nope');
    });
    const store = setup();
    store.warm();
    await Promise.resolve();
    expect(api['assistantWarm']).toHaveBeenCalledTimes(1);
  });

  it('subscribes once and unsubscribes on destroy', async () => {
    const store = setup();
    await store.load();
    await store.load();
    expect(api['onAssistantEvent']).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('follows status events and releases the avatar on error', async () => {
    const store = setup();
    await store.load();
    emit({
      type: 'status',
      status: { state: 'unavailable', reason: 'notInstalled' },
    });
    expect(store.status()).toEqual({
      state: 'unavailable',
      reason: 'notInstalled',
    });
    emit({ type: 'error', kind: 'crashed' });
    expect(work).toHaveBeenLastCalledWith(null);
  });

  it('maps send failures to an AscuaError and retry refreshes', async () => {
    const store = setup();
    await store.load();
    api['assistantSend'].mockRejectedValueOnce(
      new Error(encodeError({ code: 'assistant.busy' })),
    );
    await store.send('x');
    expect(store.error()?.code).toBe('assistant.busy');
    await store.retry();
    expect(api['assistantStatus']).toHaveBeenLastCalledWith(true);
    expect(store.error()).toBeUndefined();
  });

  it('reset clears the messages', async () => {
    const store = setup();
    await store.load();
    emit({ type: 'turnStarted', turn: 't1', text: 'hola' });
    await store.reset();
    expect(store.messages()).toEqual([]);
  });

  it('fans out raw events until unsubscribed', async () => {
    const store = setup();
    await store.load();
    const seen = vi.fn();
    const off = store.events(seen);
    emit({ type: 'text', turn: 't1', delta: 'a' });
    off();
    emit({ type: 'text', turn: 't1', delta: 'b' });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('listen follows events without reading the snapshot', () => {
    const store = setup();
    store.listen();
    store.listen();
    expect(api['onAssistantEvent']).toHaveBeenCalledTimes(1);
    expect(api['assistantStatus']).not.toHaveBeenCalled();
    emit({ type: 'turnStarted', turn: 't1', text: 'hola' });
    expect(store.busy()).toBe(true);
  });

  it('the first send fetches the snapshot, later ones do not', async () => {
    const store = setup();
    store.listen();
    await store.send('a');
    await store.send('b');
    expect(api['assistantStatus']).toHaveBeenCalledTimes(1);
    expect(api['assistantSend']).toHaveBeenCalledTimes(2);
  });

  it('reports noDesktop without the API', async () => {
    const store = setup(null);
    await store.load();
    expect(store.error()).toEqual({ code: 'noDesktop' });
    await store.send('x');
    expect(store.error()).toEqual({ code: 'noDesktop' });
  });
});
