import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newStreamState, StreamJsonParser, toEvents } from './stream-json';

function run(name: string) {
  const text = readFileSync(join(__dirname, 'fixtures', name), 'utf8');
  const state = newStreamState();
  const lines = new StreamJsonParser().push(text);
  return { state, events: lines.flatMap((l) => toEvents(l, 't1', state)) };
}

describe('StreamJsonParser', () => {
  it('buffers partial lines and skips garbage', () => {
    const p = new StreamJsonParser();
    expect(p.push('{"a":1}\nnot json\n{"b"')).toEqual([{ a: 1 }]);
    expect(p.push(':2}\n')).toEqual([{ b: 2 }]);
  });
});

describe('toEvents', () => {
  it('maps a turn with a tool call', () => {
    const { state, events } = run('turn-with-tool.jsonl');
    expect(events).toEqual([
      {
        type: 'toolStarted',
        turn: 't1',
        callId: 'toolu_01',
        tool: 'projects_list',
      },
      { type: 'toolFinished', turn: 't1', callId: 'toolu_01', ok: true },
      { type: 'text', turn: 't1', delta: 'Tienes ' },
      { type: 'text', turn: 't1', delta: 'un proyecto.' },
      { type: 'turnDone', turn: 't1', outcome: 'done' },
    ]);
    expect(state.sessionId).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('flags a tool_result error as not ok', () => {
    const events = toEvents(
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true }],
        },
      },
      't',
      newStreamState(),
    );
    expect(events).toEqual([
      { type: 'toolFinished', turn: 't', callId: 'x', ok: false },
    ]);
  });

  it('maps a login failure', () => {
    expect(run('not-logged-in.jsonl').events).toEqual([
      { type: 'error', turn: 't1', kind: 'notLoggedIn' },
    ]);
  });

  it('does not read a generic authentication error as logged out', () => {
    expect(
      toEvents(
        {
          type: 'result',
          subtype: 'success',
          is_error: true,
          result: 'MCP authentication failed for server x',
        },
        't',
        newStreamState(),
      ),
    ).toEqual([{ type: 'error', turn: 't', kind: 'failed' }]);
  });

  it('maps a failed ascua mcp server', () => {
    expect(run('mcp-failed.jsonl').events).toEqual([
      { type: 'error', turn: 't1', kind: 'failed' },
    ]);
  });

  it('treats other failed results as failed and ignores unknown lines', () => {
    const s = newStreamState();
    expect(
      toEvents(
        { type: 'result', subtype: 'error_during_execution', result: 'boom' },
        't',
        s,
      ),
    ).toEqual([{ type: 'error', turn: 't', kind: 'failed' }]);
    expect(toEvents({ type: 'weird' }, 't', s)).toEqual([]);
  });
});
