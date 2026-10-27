import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@ascua/assistant';
import type { Project, TerminalSession } from '@ascua/ipc';
import { stripAnsi, terminalsCapability } from './terminals-capability';

const ctx = { signal: new AbortController().signal };
const project: Project = {
  id: 'p1',
  name: 'Demo',
  path: '/d',
  terminals: [{ id: 't1', name: 'web', command: 'x' }],
};
const sessions: TerminalSession[] = [
  {
    id: 'p1:t1',
    projectId: 'p1',
    terminalId: 't1',
    kind: 'pista',
    status: 'running',
  },
  {
    id: 'p1:s1',
    projectId: 'p1',
    terminalId: 's1',
    kind: 'shell',
    name: 'shell',
    status: 'stopped',
  },
];
const calls: string[] = [];
const confirms: {
  tool: string;
  params: Record<string, string>;
  detail?: string;
}[] = [];
const shellSession = (status: 'running' | 'stopped') =>
  ({
    ...sessions[1],
    id: 'p1:s2',
    terminalId: 's2',
    status,
  }) as TerminalSession;
const registry = new ToolRegistry(
  [
    terminalsCapability(
      {
        list: () => [...sessions, shellSession('running')],
        replay: async () => ({
          data: '\u001b[32mok\u001b[0m ' + 'x'.repeat(30_000),
          seq: 1,
        }),
        start: async (p: string, t: string) => {
          calls.push(`start ${p}:${t}`);
          return sessions[0];
        },
        startProject: async (p: string) => {
          calls.push(`startProject ${p}`);
          return [sessions[0]];
        },
        stop: (p: string, t: string) => void calls.push(`stop ${p}:${t}`),
        openShell: async () => sessions[1],
        closeShell: (p: string, t: string) =>
          void calls.push(`close ${p}:${t}`),
        write: (id: string, data: string) =>
          void calls.push(`write ${id} ${JSON.stringify(data)}`),
      },
      {
        list: async () => [project],
        get: async (id: string) => (id === 'p1' ? project : undefined),
      },
    ),
  ],
  {
    confirm: async (req) => {
      confirms.push({ tool: req.tool, params: req.params, detail: req.detail });
      return true;
    },
  },
);

describe('terminalsCapability', () => {
  it('strips ANSI sequences', () => {
    expect(stripAnsi('\u001b[1;31mred\u001b[0m \u001b]0;title\u0007done')).toBe(
      'red done',
    );
  });

  it('summarizes writes with names and the exact command or text', async () => {
    confirms.length = 0;
    calls.length = 0;
    await registry.call(
      'terminals_start',
      { projectId: 'p1', terminalId: 't1' },
      ctx,
    );
    await registry.call('terminals_start_all', { projectId: 'p1' }, ctx);
    await registry.call(
      'terminals_write',
      { id: 'p1:s2', text: 'npm test' },
      ctx,
    );
    expect(confirms[0]).toEqual({
      tool: 'terminals_start',
      params: { project: 'Demo', pista: 'web' },
      detail: 'x',
    });
    expect(confirms[1].params).toEqual({ project: 'Demo', count: '1' });
    expect(confirms[2].detail).toBe('npm test');
    expect(calls).toEqual([
      'start p1:t1',
      'startProject p1',
      'write p1:s2 "npm test\\r"',
    ]);
  });

  it('rejects unknown ids before any confirmation', async () => {
    confirms.length = 0;
    for (const [tool, input] of [
      ['terminals_start', { projectId: 'nope', terminalId: 't1' }],
      ['terminals_start', { projectId: 'p1', terminalId: 'nope' }],
      ['terminals_start_all', { projectId: 'nope' }],
      ['terminals_stop', { id: 'nope' }],
      ['terminals_open_shell', { projectId: 'nope' }],
      ['terminals_write', { id: 'nope', text: 'ls' }],
    ] as const) {
      expect(await registry.call(tool, input, ctx)).toMatchObject({
        ok: false,
        error: 'invalidInput',
      });
    }
    expect(confirms).toHaveLength(0);
  });

  it('limits terminals_write to one plain line on a running terminal', async () => {
    confirms.length = 0;
    for (const text of [
      'a\nb',
      'a\rb',
      'a\u001bb',
      'a​b',
      'a‮b',
      '﻿ls',
      '',
      'x'.repeat(1001),
    ]) {
      expect(
        await registry.call('terminals_write', { id: 'p1:s2', text }, ctx),
      ).toMatchObject({ ok: false, error: 'invalidInput' });
    }
    expect(
      await registry.call('terminals_write', { id: 'p1:s1', text: 'ls' }, ctx),
    ).toMatchObject({ ok: false, error: 'invalidInput' });
    expect(confirms).toHaveLength(0);
  });

  it('close_shell refuses a pista', async () => {
    expect(
      await registry.call('terminals_close_shell', { id: 'p1:t1' }, ctx),
    ).toMatchObject({ ok: false, error: 'invalidInput' });
  });

  it('lists status with names', async () => {
    const r = await registry.call('terminals_list', {}, ctx);
    expect(r).toMatchObject({
      ok: true,
      value: [
        { id: 'p1:t1', project: 'Demo', name: 'web', status: 'running' },
        { id: 'p1:s1', name: 'shell', status: 'stopped' },
        { id: 'p1:s2', name: 'shell', status: 'running' },
      ],
    });
  });

  it('returns a clean capped tail and rejects unknown ids', async () => {
    const r = await registry.call(
      'terminals_output',
      { id: 'p1:t1', chars: 50_000 },
      ctx,
    );
    const value = (r as { value: { output: string; truncated: boolean } })
      .value;
    expect(value.output).toHaveLength(20_000);
    expect(value.truncated).toBe(true);
    const short = await registry.call(
      'terminals_output',
      { id: 'p1:t1', chars: 5 },
      ctx,
    );
    expect((short as { value: { output: string } }).value.output).toBe('xxxxx');
    expect(
      await registry.call('terminals_output', { id: 'nope' }, ctx),
    ).toMatchObject({
      ok: false,
      error: 'invalidInput',
    });
  });
});
