import { describe, expect, it, vi } from 'vitest';
import {
  ToolInputError,
  ToolRegistry,
  reduceTranscript,
  validateInput,
  type AssistantEvent,
  type Capability,
  type Confirmer,
  type JsonSchema,
  type ToolDefinition,
  type TranscriptMessage,
} from '@ascua/assistant';

const schema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    count: { type: 'integer' },
    mode: { type: 'string', enum: ['a', 'b'] },
  },
  required: ['name'],
};

const ctx = { signal: new AbortController().signal };

function tool(over: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'demo_echo',
    description: 'echo',
    inputSchema: schema,
    effect: 'read',
    run: async (input) => input,
    ...over,
  };
}

function registry(tools: ToolDefinition[], confirmer?: Confirmer) {
  const confirm = confirmer ?? { confirm: vi.fn(async () => true) };
  return { reg: new ToolRegistry([{ id: 'demo', tools }], confirm), confirm };
}

describe('validateInput', () => {
  it('accepts valid input', () => {
    expect(
      validateInput(schema, { name: 'x', count: 2, mode: 'a' }),
    ).toBeUndefined();
  });
  it('rejects non-objects, missing, types, enums, unknown keys, fractions', () => {
    expect(validateInput(schema, null)).toBeDefined();
    expect(validateInput(schema, [])).toBeDefined();
    expect(validateInput(schema, {})).toContain('name');
    expect(validateInput(schema, { name: 1 })).toContain('string');
    expect(validateInput(schema, { name: 'x', mode: 'z' })).toContain('one of');
    expect(validateInput(schema, { name: 'x', extra: 1 })).toContain('extra');
    expect(validateInput(schema, { name: 'x', count: 1.5 })).toContain(
      'integer',
    );
  });
});

describe('ToolRegistry', () => {
  it('rejects duplicates and bad names or ids', () => {
    const c: Capability = { id: 'demo', tools: [tool(), tool()] };
    expect(
      () => new ToolRegistry([c], { confirm: async () => true }),
    ).toThrow();
    expect(() => registry([tool({ name: 'Bad' })])).toThrow();
    expect(() => registry([tool({ name: 'other_x' })])).toThrow();
    expect(
      () =>
        new ToolRegistry([{ id: 'Bad', tools: [] }], {
          confirm: async () => true,
        }),
    ).toThrow();
  });

  it('lists tools with needsConfirmation', () => {
    const { reg } = registry([
      tool(),
      tool({ name: 'demo_w', effect: 'write' }),
      tool({ name: 'demo_f', effect: 'write', confirm: false }),
    ]);
    expect(reg.list().map((t) => [t.name, t.needsConfirmation])).toEqual([
      ['demo_echo', false],
      ['demo_w', true],
      ['demo_f', false],
    ]);
  });

  it('reports unknown tool and invalid input', async () => {
    const { reg } = registry([tool()]);
    expect(await reg.call('nope', {}, ctx)).toMatchObject({
      ok: false,
      error: 'unknownTool',
    });
    expect(await reg.call('demo_echo', {}, ctx)).toMatchObject({
      ok: false,
      error: 'invalidInput',
    });
  });

  it('runs a valid call', async () => {
    const { reg } = registry([tool()]);
    expect(await reg.call('demo_echo', { name: 'x' }, ctx)).toEqual({
      ok: true,
      value: { name: 'x' },
    });
  });

  it('maps ToolInputError to invalidInput and other throws to failed', async () => {
    const { reg } = registry([
      tool({
        run: async () => {
          throw new ToolInputError('bad id');
        },
      }),
      tool({
        name: 'demo_boom',
        run: async () => {
          throw new Error('boom');
        },
      }),
    ]);
    expect(await reg.call('demo_echo', { name: 'x' }, ctx)).toEqual({
      ok: false,
      error: 'invalidInput',
      detail: 'bad id',
    });
    expect(await reg.call('demo_boom', { name: 'x' }, ctx)).toMatchObject({
      ok: false,
      error: 'failed',
    });
  });

  it('refuses when the confirmer declines and skips it for confirm:false', async () => {
    const run = vi.fn(async () => 1);
    const confirm = { confirm: vi.fn(async () => false) };
    const { reg } = registry(
      [
        tool({ name: 'demo_w', effect: 'write', run }),
        tool({ name: 'demo_f', effect: 'write', confirm: false, run }),
      ],
      confirm,
    );
    expect(await reg.call('demo_w', { name: 'x' }, ctx)).toMatchObject({
      ok: false,
      error: 'refused',
    });
    expect(run).not.toHaveBeenCalled();
    expect(await reg.call('demo_f', { name: 'x' }, ctx)).toEqual({
      ok: true,
      value: 1,
    });
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
  });

  it('passes summarize params to the confirmer', async () => {
    const { reg, confirm } = registry([
      tool({
        name: 'demo_w',
        effect: 'write',
        summarize: async () => ({ params: { project: 'p' }, detail: 'ls' }),
      }),
    ]);
    await reg.call('demo_w', { name: 'x' }, ctx);
    expect(confirm.confirm).toHaveBeenCalledWith(
      {
        tool: 'demo_w',
        input: { name: 'x' },
        params: { project: 'p' },
        detail: 'ls',
      },
      ctx.signal,
    );
  });

  it('returns invalidInput without confirming when summarize throws ToolInputError', async () => {
    const run = vi.fn(async () => 1);
    const { reg, confirm } = registry([
      tool({
        name: 'demo_w',
        effect: 'write',
        run,
        summarize: async () => {
          throw new ToolInputError('unknown id');
        },
      }),
    ]);
    expect(await reg.call('demo_w', { name: 'x' }, ctx)).toEqual({
      ok: false,
      error: 'invalidInput',
      detail: 'unknown id',
    });
    expect(confirm.confirm).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('reduceTranscript', () => {
  const run = (events: AssistantEvent[]) =>
    events.reduce<TranscriptMessage[]>((m, e) => reduceTranscript(m, e), []);

  it('builds a streamed turn with a tool', () => {
    const before: TranscriptMessage[] = [];
    const messages = run([
      { type: 'turnStarted', turn: 't1', text: 'hola' },
      { type: 'toolStarted', turn: 't1', callId: 'c1', tool: 'projects_list' },
      { type: 'toolFinished', turn: 't1', callId: 'c1', ok: true },
      { type: 'text', turn: 't1', delta: 'Hola' },
      { type: 'text', turn: 't1', delta: ' mundo' },
      { type: 'turnDone', turn: 't1', outcome: 'done' },
    ]);
    expect(before).toEqual([]);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', text: 'hola' });
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      text: 'Hola mundo',
      state: 'done',
      tools: [{ callId: 'c1', tool: 'projects_list', state: 'ok' }],
    });
  });

  it('separates text blocks around a tool call', () => {
    const messages = run([
      { type: 'turnStarted', turn: 't1', text: 'hola' },
      { type: 'text', turn: 't1', delta: 'Voy a mirar.' },
      { type: 'toolStarted', turn: 't1', callId: 'c1', tool: 'projects_list' },
      { type: 'toolFinished', turn: 't1', callId: 'c1', ok: true },
      { type: 'text', turn: 't1', delta: 'Tienes dos.' },
    ]);
    expect(messages[1].text).toBe('Voy a mirar.\nTienes dos.');
  });

  it('marks cancel and error, and is immutable', () => {
    const start = reduceTranscript([], {
      type: 'turnStarted',
      turn: 't',
      text: 'x',
    });
    const snapshot = JSON.stringify(start);
    const failed = reduceTranscript(start, {
      type: 'error',
      turn: 't',
      kind: 'crashed',
    });
    expect(JSON.stringify(start)).toBe(snapshot);
    expect(failed[1]).toMatchObject({ state: 'failed', error: 'crashed' });
    const cancelled = reduceTranscript(start, {
      type: 'turnDone',
      turn: 't',
      outcome: 'cancelled',
    });
    expect(cancelled[1].state).toBe('cancelled');
    expect(
      reduceTranscript(start, { type: 'status', status: { state: 'ready' } }),
    ).toBe(start);
  });
});
