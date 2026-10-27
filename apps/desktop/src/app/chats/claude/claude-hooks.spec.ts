import { describe, expect, it } from 'vitest';
import { SessionTrace, type HarnessGate } from '@ascua/chat';
import { toSdkHooks } from './claude-hooks';

const call = (hook: any, input: object) =>
  hook[0].hooks[0](input, undefined, { signal: new AbortController().signal });

const deny = (on: HarnessGate['on']): HarnessGate => ({
  id: 'd',
  on,
  check: () => ({ allow: false, reason: 'nope' }),
});

describe('toSdkHooks', () => {
  it('denies a tool with the gate reason', async () => {
    const h = toSdkHooks([deny('beforeTool')], new SessionTrace());
    const out = await call(h.PreToolUse, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {},
    });
    expect(out.hookSpecificOutput).toMatchObject({
      permissionDecision: 'deny',
      permissionDecisionReason: 'nope',
    });
  });

  it('blocks stop once, then lets it stop', async () => {
    const h = toSdkHooks([deny('beforeStop')], new SessionTrace());
    const first = await call(h.Stop, {
      hook_event_name: 'Stop',
      stop_hook_active: false,
    });
    expect(first).toEqual({ decision: 'block', reason: 'nope' });
    const second = await call(h.Stop, {
      hook_event_name: 'Stop',
      stop_hook_active: true,
    });
    expect(second).toEqual({});
  });

  it('records tool names in the trace', async () => {
    const trace = new SessionTrace();
    const h = toSdkHooks([], trace);
    await call(h.PostToolUse, {
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
    });
    expect(trace.used('Read')).toBe(true);
  });

  it('fails open when a gate throws', async () => {
    const boom: HarnessGate = {
      id: 'b',
      on: 'beforeTool',
      check: () => {
        throw new Error('x');
      },
    };
    const h = toSdkHooks([boom], new SessionTrace());
    const out = await call(h.PreToolUse, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: {},
    });
    expect(out).toEqual({});
  });
});
