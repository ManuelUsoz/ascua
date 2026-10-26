import { describe, expect, it, vi } from 'vitest';
import type { AssistantEngine, AssistantEvent } from '@ascua/assistant';
import { IPC } from '@ascua/ipc';

vi.mock('node:crypto', () => {
  let n = 0;
  return { randomUUID: () => `t${++n}` };
});

import { AssistantService } from './assistant-service';

function setup() {
  let listener: (e: AssistantEvent) => void = () => undefined;
  const engine = {
    status: vi.fn().mockResolvedValue({ state: 'ready' }),
    send: vi.fn().mockResolvedValue(undefined),
    warm: vi.fn(),
    cancel: vi.fn(),
    reset: vi.fn(),
    stop: vi.fn(),
    onEvent: vi.fn((l: (e: AssistantEvent) => void) => {
      listener = l;
      return () => undefined;
    }),
  } satisfies AssistantEngine;
  const sent: [string, unknown][] = [];
  const service = new AssistantService({
    engine,
    send: (channel, payload) => sent.push([channel, payload]),
  });
  return { engine, service, sent, emit: (e: AssistantEvent) => listener(e) };
}

describe('AssistantService', () => {
  it('trims, announces the turn and hands it to the engine', async () => {
    const { engine, service, sent } = setup();
    await service.send('  hola  ');
    const [turn, text] = engine.send.mock.calls[0];
    expect(text).toBe('hola');
    expect(sent[0]).toEqual([
      IPC.assistantEvent,
      { type: 'turnStarted', turn, text: 'hola' },
    ]);
  });

  it('forwards warm to the engine', () => {
    const { engine, service } = setup();
    service.warm();
    expect(engine.warm).toHaveBeenCalledTimes(1);
  });

  it('rejects empty and oversized text', async () => {
    const { engine, service } = setup();
    await expect(service.send('   ')).rejects.toThrow();
    await expect(service.send('x'.repeat(8001))).rejects.toThrow();
    expect(engine.send).not.toHaveBeenCalled();
  });

  it('forwards engine events and keeps the transcript', async () => {
    const { service, sent, emit } = setup();
    await service.send('hola');
    const turn = (sent[0][1] as { turn: string }).turn;
    emit({ type: 'text', turn, delta: 'Hola' });
    emit({ type: 'turnDone', turn, outcome: 'done' });
    expect(sent.at(-1)?.[1]).toMatchObject({ type: 'turnDone' });
    const { messages } = await service.snapshot();
    expect(messages.map((m) => m.text)).toEqual(['hola', 'Hola']);
    expect(messages[1].state).toBe('done');
  });

  it('refuses a second turn while one is running', async () => {
    const { service } = setup();
    await service.send('uno');
    await expect(service.send('dos')).rejects.toMatchObject({ kind: 'busy' });
  });

  it('reset clears the transcript and resets the engine', async () => {
    const { engine, service } = setup();
    await service.send('hola');
    service.reset();
    expect(engine.reset).toHaveBeenCalled();
    expect((await service.snapshot()).messages).toEqual([]);
    await expect(service.send('otra')).resolves.toBeUndefined();
  });

  it('reset ends a running turn with turnDone cancelled', async () => {
    const { service, sent } = setup();
    await service.send('hola');
    const turn = (sent[0][1] as { turn: string }).turn;
    service.reset();
    expect(sent.at(-1)).toEqual([
      IPC.assistantEvent,
      { type: 'turnDone', turn, outcome: 'cancelled' },
    ]);
  });

  it('reset with no running turn emits nothing', () => {
    const { service, sent } = setup();
    service.reset();
    expect(sent).toEqual([]);
  });

  it('passes refresh to the engine status', async () => {
    const { engine, service } = setup();
    await service.snapshot(true);
    expect(engine.status).toHaveBeenCalledWith(true);
  });
});
