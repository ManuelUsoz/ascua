import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IPC, terminalKey } from '@ascua/ipc';
import type { Project } from '@ascua/ipc';
import type { HostEvent, HostRequest } from './host/pty-protocol';
import type { PtyBackend } from './pty-backend';
import { TerminalManager } from './terminal-manager';

const project: Project = {
  id: 'p1',
  name: 'Demo',
  path: resolve('/demo'),
  terminals: [
    { id: 't1', name: 'api', command: './mvnw spring-boot:run', cwd: 'api' },
    { id: 't2', name: 'web', command: 'npm start' },
  ],
};

function setup(exists = true) {
  const requests: HostRequest[] = [];
  const notes: { channel: string; payload: unknown }[] = [];
  let emit: (event: HostEvent) => void = () => undefined;
  const backend: PtyBackend = {
    request: (m) => void requests.push(m),
    snapshot: async () => ({ data: '', seq: 0 }),
    onEvent: (l) => {
      emit = l;
      return () => undefined;
    },
    dispose: () => undefined,
  };
  const repository = {
    list: async () => [project],
    get: async (id: string) => (id === project.id ? project : undefined),
    save: async (p: Project) => p,
    remove: async () => undefined,
  };
  const manager = new TerminalManager(
    repository,
    backend,
    (channel, payload) => notes.push({ channel, payload }),
    { kind: 'git-bash', file: 'C:\\Git\\bin\\bash.exe' },
    () => exists,
  );
  return { manager, requests, notes, emit: (e: HostEvent) => emit(e) };
}

describe('TerminalManager', () => {
  it('requests a spawn in the spec cwd through the shell', async () => {
    const { manager, requests } = setup();
    const session = await manager.start('p1', 't1');
    expect(session.status).toBe('running');
    const spawn = requests[0];
    expect(spawn).toMatchObject({
      type: 'spawn',
      id: terminalKey('p1', 't1'),
      file: 'C:\\Git\\bin\\bash.exe',
      args: ['--login', '-c', './mvnw spring-boot:run'],
      cwd: resolve(project.path, 'api'),
      cols: 120,
      rows: 30,
    });
    expect(spawn.type === 'spawn' && spawn.env['CHERE_INVOKING']).toBe('1');
  });

  it('does not respawn a running terminal', async () => {
    const { manager, requests } = setup();
    await manager.start('p1', 't1');
    await manager.start('p1', 't1');
    expect(requests).toHaveLength(1);
  });

  it('opens ad-hoc shells at the project root, named shell / shell 2', async () => {
    const { manager, requests } = setup();
    const a = await manager.openShell('p1');
    const b = await manager.openShell('p1');
    expect(a).toMatchObject({ kind: 'shell', name: 'shell', status: 'running' });
    expect(b).toMatchObject({ kind: 'shell', name: 'shell 2' });
    expect(a.terminalId).not.toBe(b.terminalId);
    expect(requests[0]).toMatchObject({
      type: 'spawn',
      args: ['--login', '-i'],
      cwd: project.path,
    });
  });

  it('does not register a session when opening a shell for a missing project', async () => {
    const { manager, requests } = setup();
    const view = await manager.openShell('nope');
    expect(view).toMatchObject({ kind: 'shell', status: 'failed' });
    expect(manager.list()).toHaveLength(0);
    expect(requests).toHaveLength(0);
  });

  it('reuses a freed shell name after close', async () => {
    const { manager } = setup();
    await manager.openShell('p1');
    const b = await manager.openShell('p1');
    manager.closeShell('p1', b.terminalId);
    const c = await manager.openShell('p1');
    expect(c.name).toBe('shell 2');
  });

  it('closeShell kills, disposes and emits terminalRemoved', async () => {
    const { manager, requests, notes } = setup();
    const shell = await manager.openShell('p1');
    manager.closeShell('p1', shell.terminalId);
    expect(requests.slice(-2)).toEqual([
      { type: 'kill', id: shell.id },
      { type: 'dispose', id: shell.id },
    ]);
    expect(manager.list()).toEqual([]);
    expect(notes.at(-1)).toEqual({
      channel: IPC.terminalRemoved,
      payload: shell.id,
    });
  });

  it('keeps shells on save and announces removed specs', async () => {
    const { manager, notes } = setup();
    const shell = await manager.openShell('p1');
    await manager.start('p1', 't1');
    manager.saved({ ...project, terminals: [project.terminals[1]] });
    expect(manager.list().map((s) => s.terminalId)).toEqual([shell.terminalId]);
    expect(notes.at(-1)).toEqual({
      channel: IPC.terminalRemoved,
      payload: terminalKey('p1', 't1'),
    });
  });

  it('reopens an exited shell at the project root', async () => {
    const { manager, requests, emit } = setup();
    const shell = await manager.openShell('p1');
    emit({ type: 'exit', id: shell.id, exitCode: 0 });
    const again = await manager.start('p1', shell.terminalId);
    expect(again).toMatchObject({ kind: 'shell', name: 'shell', status: 'running' });
    expect(requests.filter((r) => r.type === 'spawn')).toHaveLength(2);
    expect(requests.at(-1)).toMatchObject({ cwd: project.path });
  });

  it('drops the shells of a removed project', async () => {
    const { manager } = setup();
    await manager.openShell('p1');
    await manager.removed('p1');
    expect(manager.list()).toEqual([]);
  });

  it('maps exit codes to statuses', async () => {
    const { manager, emit, notes } = setup();
    const id = terminalKey('p1', 't1');
    await manager.start('p1', 't1');
    emit({ type: 'exit', id, exitCode: 0 });
    expect(manager.list()[0].status).toBe('stopped');

    await manager.start('p1', 't1');
    emit({ type: 'exit', id, exitCode: 2 });
    expect(manager.list()[0]).toMatchObject({ status: 'failed', exitCode: 2 });
    expect(notes.at(-1)?.channel).toBe(IPC.terminalChanged);
  });

  it('reports a user stop as stopped, not failed', async () => {
    const { manager, emit, requests } = setup();
    const id = terminalKey('p1', 't1');
    await manager.start('p1', 't1');
    manager.stop('p1', 't1');
    expect(requests.at(-1)).toEqual({ type: 'kill', id });
    emit({ type: 'exit', id, exitCode: 1 });
    expect(manager.list()[0].status).toBe('stopped');
  });

  it('forwards output', async () => {
    const { emit, notes } = setup();
    emit({ type: 'data', id: 'x', data: 'hi', seq: 2 });
    expect(notes[0]).toEqual({
      channel: IPC.terminalOutput,
      payload: { id: 'x', data: 'hi', seq: 2 },
    });
  });

  it('fails when the folder is missing', async () => {
    const { manager, requests } = setup(false);
    const session = await manager.start('p1', 't1');
    expect(session.status).toBe('failed');
    expect(session.error).toContain('No existe la carpeta');
    expect(requests).toHaveLength(0);
  });

  it('stops sessions whose spec was removed on save', async () => {
    const { manager, requests, notes } = setup();
    await manager.start('p1', 't1');
    await manager.start('p1', 't2');
    manager.saved({ ...project, terminals: [project.terminals[1]] });
    expect(requests.filter((r) => r.type === 'kill')).toEqual([
      { type: 'kill', id: terminalKey('p1', 't1') },
    ]);
    expect(manager.list().map((s) => s.terminalId)).toEqual(['t2']);
    expect(notes.at(-1)).toEqual({
      channel: IPC.terminalRemoved,
      payload: terminalKey('p1', 't1'),
    });
  });
});
