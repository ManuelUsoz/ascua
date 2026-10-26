import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantEvent } from '@ascua/assistant';
import {
  ClaudeCodeEngine,
  shellArg,
  type ChildLike,
} from './claude-code-engine';

class FakeChild extends EventEmitter {
  written: string[] = [];
  killed = false;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    write: (d: string) => this.written.push(d),
    end: () => undefined,
  };
  kill() {
    this.killed = true;
  }
  out(obj: unknown) {
    this.stdout.emit('data', JSON.stringify(obj) + '\n');
  }
}

describe('ClaudeCodeEngine', () => {
  let dir: string;
  let children: FakeChild[];
  let calls: { file: string; args: string[]; env: NodeJS.ProcessEnv }[];
  let events: AssistantEvent[];
  let engine: ClaudeCodeEngine;
  let resolved = true;
  let made: string[];

  beforeEach(() => {
    made = [];
    dir = mkdtempSync(join(tmpdir(), 'ascua-engine-'));
    children = [];
    calls = [];
    events = [];
    resolved = true;
    engine = new ClaudeCodeEngine({
      resolve: () =>
        resolved
          ? { file: 'claude', prefixArgs: [], env: {}, shell: false }
          : undefined,
      spawn: (file, args, options) => {
        const c = new FakeChild();
        children.push(c);
        calls.push({ file, args, env: options.env });
        return c as unknown as ChildLike;
      },
      workDir: dir,
      endpoint: async () => ({ url: 'http://127.0.0.1:1/mcp', token: 'tok' }),
      language: async () => 'es',
      tools: () => ['projects_list'],
      toolTimeoutMs: 150000,
      env: {},
      mkdir: async (d) => {
        made.push(d);
      },
    });
    engine.onEvent((e) => events.push(e));
  });

  afterEach(() => engine.stop());

  const types = () =>
    events.filter((e) => e.type !== 'status').map((e) => e.type);
  const result = { type: 'result', subtype: 'success', is_error: false };
  const init = { type: 'system', subtype: 'init', session_id: 'sess-1' };

  it('runs a turn and emits events in order', async () => {
    await engine.send('t1', 'hola');
    const child = children[0];
    expect(JSON.parse(child.written[0])).toEqual({
      type: 'user',
      message: { role: 'user', content: 'hola' },
    });
    child.out(init);
    child.out({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hi' },
      },
    });
    child.out(result);
    expect(types()).toEqual(['text', 'turnDone']);
    expect(await engine.status()).toEqual({ state: 'ready' });
    const mcp = JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8'));
    expect(mcp.mcpServers.ascua.headers.Authorization).toBe('Bearer tok');
  });

  it('refuses a second turn while busy', async () => {
    await engine.send('t1', 'a');
    await expect(engine.send('t2', 'b')).rejects.toMatchObject({
      kind: 'busy',
    });
    expect(await engine.status()).toEqual({ state: 'busy' });
  });

  it('reuses the process for the next turn', async () => {
    await engine.send('t1', 'a');
    children[0].out(result);
    await engine.send('t2', 'b');
    expect(children).toHaveLength(1);
    expect(children[0].written).toHaveLength(2);
  });

  const lastRequest = (child: FakeChild) =>
    JSON.parse(child.written.at(-1) as string);
  const interruptResult = {
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
  };
  const ack = (id: string) => ({
    type: 'control_response',
    response: { subtype: 'success', request_id: id },
  });

  it('cancel interrupts the process instead of killing it', async () => {
    await engine.send('t1', 'a');
    children[0].out(init);
    engine.cancel();
    expect(children[0].killed).toBe(false);
    expect(lastRequest(children[0])).toEqual({
      type: 'control_request',
      request_id: 'interrupt-1',
      request: { subtype: 'interrupt' },
    });
    expect(events.at(-2)).toEqual({
      type: 'turnDone',
      turn: 't1',
      outcome: 'cancelled',
    });
    expect(await engine.status()).toEqual({ state: 'ready' });
  });

  it('swallows the late error result and reuses the child', async () => {
    await engine.send('t1', 'a');
    engine.cancel();
    const next = engine.send('t2', 'b');
    children[0].out(ack('interrupt-1'));
    children[0].out(interruptResult);
    await next;
    expect(children).toHaveLength(1);
    expect(children[0].killed).toBe(false);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(JSON.parse(children[0].written.at(-1) as string).type).toBe('user');
    children[0].out(result);
    expect(events.at(-2)).toEqual({
      type: 'turnDone',
      turn: 't2',
      outcome: 'done',
    });
  });

  it('kills when the interrupt is refused', async () => {
    await engine.send('t1', 'a');
    engine.cancel();
    children[0].out({
      type: 'control_response',
      response: { subtype: 'error', request_id: 'interrupt-1' },
    });
    expect(children[0].killed).toBe(true);
    await engine.send('t2', 'b');
    expect(children).toHaveLength(2);
  });

  it('kills when no result follows the interrupt', async () => {
    vi.useFakeTimers();
    try {
      await engine.send('t1', 'a');
      engine.cancel();
      vi.advanceTimersByTime(3001);
      expect(children[0].killed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes the session after a respawn', async () => {
    await engine.send('t1', 'a');
    children[0].out(init);
    engine.cancel();
    children[0].emit('exit', 1);
    await engine.send('t2', 'b');
    expect(children).toHaveLength(2);
    expect(calls[1].args).toContain('--resume');
    expect(calls[1].args).toContain('sess-1');
  });

  it('warm spawns once and the first send reuses it', async () => {
    engine.warm();
    engine.warm();
    await vi.waitFor(() => expect(children).toHaveLength(1)); // auth status
    children[0].stdout.emit('data', '{"loggedIn":true}');
    children[0].emit('exit', 0);
    await vi.waitFor(() => expect(children).toHaveLength(2));
    expect(children[1].written).toHaveLength(0);
    await engine.send('t1', 'hola');
    expect(children).toHaveLength(2);
    expect(children[1].written).toHaveLength(1);
  });

  it('does not write a turn cancelled while spawning', async () => {
    const sent = engine.send('t1', 'a');
    engine.cancel();
    await sent;
    expect(children.every((c) => c.written.length === 0)).toBe(true);
    expect(await engine.status()).toEqual({ state: 'ready' });
  });

  it('reaps an idle warm process and keeps the session', async () => {
    vi.useFakeTimers();
    try {
      await engine.send('t1', 'a');
      children[0].out(init);
      children[0].out(result);
      vi.advanceTimersByTime(10 * 60_000 + 1);
      expect(children[0].killed).toBe(true);
      await engine.send('t2', 'b');
      expect(children).toHaveLength(2);
      expect(calls[1].args).toContain('sess-1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes the tool timeout into mcp.json', async () => {
    await engine.send('t1', 'a');
    const mcp = JSON.parse(readFileSync(join(dir, 'mcp.json'), 'utf8'));
    expect(mcp.mcpServers.ascua.timeout).toBe(150000);
  });

  it('disables claude.ai connectors for the turn and for auth status', async () => {
    await engine.send('t1', 'a');
    expect(calls[0].env['ENABLE_CLAUDEAI_MCP_SERVERS']).toBe('false');
    children[0].out(result);
    const pending = engine.status(true);
    await new Promise((r) => setTimeout(r));
    const auth = calls.find((c) => c.args[0] === 'auth');
    expect(auth?.env['ENABLE_CLAUDEAI_MCP_SERVERS']).toBe('false');
    children.at(-1)?.emit('exit', 1);
    await pending;
  });

  it('reset drops the session', async () => {
    await engine.send('t1', 'a');
    children[0].out(init);
    children[0].out(result);
    engine.reset();
    await engine.send('t2', 'b');
    expect(calls[1].args).not.toContain('--resume');
  });

  it('reports a crash during a turn', async () => {
    await engine.send('t1', 'a');
    children[0].emit('exit', 1);
    expect(events.some((e) => e.type === 'error' && e.kind === 'crashed')).toBe(
      true,
    );
    expect(await engine.status()).toEqual({ state: 'ready' });
  });

  it('reports ENOENT as notInstalled', async () => {
    await engine.send('t1', 'a');
    children[0].emit(
      'error',
      Object.assign(new Error('x'), { code: 'ENOENT' }),
    );
    expect(
      events.some((e) => e.type === 'error' && e.kind === 'notInstalled'),
    ).toBe(true);
    expect(await engine.status()).toEqual({
      state: 'unavailable',
      reason: 'notInstalled',
    });
  });

  it('is notInstalled when nothing resolves', async () => {
    resolved = false;
    expect(await engine.status(true)).toEqual({
      state: 'unavailable',
      reason: 'notInstalled',
    });
    await engine.send('t1', 'a');
    expect(children).toHaveLength(0);
    expect(
      events.some((e) => e.type === 'error' && e.kind === 'notInstalled'),
    ).toBe(true);
  });

  it('reads auth status', async () => {
    const pending = engine.status(true);
    await new Promise((r) => setTimeout(r));
    expect(made).toEqual([dir]); // cwd exists before spawning, or ENOENT looks like notInstalled
    expect(calls[0].args).toEqual(['auth', 'status', '--json']);
    children[0].stdout.emit('data', '{"loggedIn":false}');
    children[0].emit('exit', 1);
    expect(await pending).toEqual({
      state: 'unavailable',
      reason: 'notLoggedIn',
    });

    const ok = engine.status(true);
    await new Promise((r) => setTimeout(r));
    children[1].stdout.emit('data', '{"loggedIn":true}');
    children[1].emit('exit', 0);
    expect(await ok).toEqual({ state: 'ready' });
  });

  it('stop kills the process and deletes mcp.json', async () => {
    await engine.send('t1', 'a');
    engine.stop();
    expect(children[0].killed).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(existsSync(join(dir, 'mcp.json'))).toBe(false);
  });
});

describe('ClaudeCodeEngine on the shell (.cmd) path', () => {
  it('quotes arguments and kills the whole tree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ascua-engine-'));
    const spawned: { args: string[] }[] = [];
    const child = new FakeChild() as FakeChild & { pid: number };
    child.pid = 4242;
    const tree: number[] = [];
    const engine = new ClaudeCodeEngine({
      resolve: () => ({
        file: 'claude.cmd',
        prefixArgs: [],
        env: {},
        shell: true,
      }),
      spawn: (_file, args) => {
        spawned.push({ args });
        return child as unknown as ChildLike;
      },
      workDir: dir,
      endpoint: async () => ({ url: 'http://127.0.0.1:1/mcp', token: 't' }),
      language: async () => 'es',
      tools: () => ['a_b', 'c_d'],
      env: {},
      mkdir: async () => undefined,
      killTree: (pid) => tree.push(pid),
    });
    await engine.send('t1', 'hola');
    const args = spawned[0].args;
    expect(args[args.indexOf('--tools') + 1]).toBe('""');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe(
      '"mcp__ascua__a_b,mcp__ascua__c_d"',
    );
    expect(args[args.indexOf('--append-system-prompt') + 1]).toMatch(/^".*"$/s);
    engine.reset();
    expect(tree).toEqual([4242]);
    expect(child.killed).toBe(false);
    engine.stop();
  });
});

describe('shellArg', () => {
  it('quotes empty, spaced and comma arguments and flattens newlines', () => {
    expect(shellArg('')).toBe('""');
    expect(shellArg('a b')).toBe('"a b"');
    expect(shellArg('a,b')).toBe('"a,b"');
    expect(shellArg('a\nb')).toBe('"a b"');
    expect(shellArg('--plain')).toBe('--plain');
  });
});
