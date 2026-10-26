import { TestBed } from '@angular/core/testing';
import type {
  AscuaApi,
  Project,
  TerminalOutput,
  TerminalReplay,
  TerminalSession,
} from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { TerminalSessions } from './terminal-sessions';

function session(
  projectId: string,
  terminalId: string,
  status: TerminalSession['status'],
): TerminalSession {
  return {
    id: `${projectId}:${terminalId}`,
    projectId,
    terminalId,
    kind: 'pista',
    status,
  };
}

const project: Project = {
  id: 'p',
  name: 'P',
  path: '/p',
  terminals: [
    { id: 'api', name: 'api', command: 'run api' },
    { id: 'web', name: 'web', command: 'run web' },
  ],
};

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('TerminalSessions', () => {
  let output: (o: TerminalOutput) => void;
  let changed: (s: TerminalSession) => void;
  let removed: (id: string) => void;
  let replay: Promise<TerminalReplay>;
  let api: Pick<
    AscuaApi,
    | 'listTerminals'
    | 'startTerminal'
    | 'startProjectTerminals'
    | 'stopTerminal'
    | 'replayTerminal'
    | 'writeTerminal'
    | 'resizeTerminal'
    | 'onTerminalOutput'
    | 'onTerminalChanged'
    | 'onTerminalRemoved'
    | 'openShell'
    | 'closeShell'
  >;
  let sessions: TerminalSessions;

  async function create(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: api }],
    });
    sessions = TestBed.inject(TerminalSessions);
    await flush();
  }

  beforeEach(() => {
    replay = Promise.resolve({ data: '', seq: 0 });
    api = {
      listTerminals: vi.fn(async () => [
        session('p', 'api', 'running'),
        { ...session('p', 'shell', 'running'), kind: 'shell' as const },
        session('q', 'api', 'running'),
      ]),
      startTerminal: vi.fn(async (projectId, terminalId) =>
        session(projectId, terminalId, 'running'),
      ),
      startProjectTerminals: vi.fn(async (projectId) => [
        session(projectId, 'api', 'running'),
        session(projectId, 'web', 'running'),
      ]),
      stopTerminal: vi.fn(async () => undefined),
      replayTerminal: vi.fn(() => replay),
      writeTerminal: vi.fn(),
      resizeTerminal: vi.fn(),
      onTerminalOutput: (cb) => {
        output = cb;
        return () => undefined;
      },
      onTerminalChanged: (cb) => {
        changed = cb;
        return () => undefined;
      },
      onTerminalRemoved: (cb) => {
        removed = cb;
        return () => undefined;
      },
      openShell: vi.fn(async (projectId) => ({
        ...session(projectId, 'shell-9', 'running'),
        kind: 'shell' as const,
        name: 'shell',
      })),
      closeShell: vi.fn(async () => undefined),
    };
  });

  it('seeds and updates statuses', async () => {
    await create();
    expect(sessions.session('p', 'api')?.status).toBe('running');
    expect(sessions.running('p')).toHaveLength(2);

    changed(session('p', 'api', 'stopped'));
    expect(sessions.session('p', 'api')?.status).toBe('stopped');
    expect(sessions.running('p').map((s) => s.terminalId)).toEqual(['shell']);
  });

  it('drops a session when main reports it removed', async () => {
    await create();
    removed('p:shell');
    expect(sessions.session('p', 'shell')).toBeUndefined();
    expect(sessions.session('p', 'api')).toBeDefined();
  });

  it('lists shells in insertion order and counts pistas plus shells', async () => {
    await create();
    changed({ ...session('p', 'shell-2', 'stopped'), kind: 'shell' });
    expect(sessions.shells('p').map((s) => s.terminalId)).toEqual([
      'shell',
      'shell-2',
    ]);
    // api running + shell running + shell-2 stopped; web has no session.
    expect(sessions.counts(project)).toEqual({ running: 2, total: 4 });
  });

  it('openShell upserts the new session; close deletes it', async () => {
    await create();
    const opened = await sessions.openShell('p', { cols: 80, rows: 24 });
    expect(api.openShell).toHaveBeenCalledWith('p', { cols: 80, rows: 24 });
    expect(opened?.terminalId).toBe('shell-9');
    expect(sessions.session('p', 'shell-9')?.kind).toBe('shell');

    await sessions.close('p', 'shell-9');
    expect(api.closeShell).toHaveBeenCalledWith('p', 'shell-9');
    expect(sessions.session('p', 'shell-9')).toBeUndefined();
  });

  it('keeps the shell error per project', async () => {
    await create();
    api.openShell.mockRejectedValueOnce(new Error('boom'));
    await sessions.openShell('p');
    const boom = { code: 'unknown', params: { detail: 'boom' } };
    expect(sessions.shellError('p')).toEqual(boom);
    expect(sessions.shellError('other')).toBeUndefined();

    await sessions.openShell('other');
    expect(sessions.shellError('p')).toEqual(boom);

    await sessions.openShell('p');
    expect(sessions.shellError('p')).toBeUndefined();
  });

  it('replays then forwards live output without duplicates', async () => {
    let resolve!: (r: TerminalReplay) => void;
    replay = new Promise((r) => (resolve = r));
    await create();

    const chunks: string[] = [];
    const attaching = sessions.attach('p:api', (d) => chunks.push(d));
    // Arrives while the replay is in flight: one covered, one new.
    output({ id: 'p:api', data: 'B', seq: 2 });
    output({ id: 'p:api', data: 'C', seq: 3 });
    resolve({ data: 'AB', seq: 2 });
    const detach = await attaching;
    expect(chunks).toEqual(['AB', 'C']);

    output({ id: 'p:api', data: 'old', seq: 2 });
    output({ id: 'p:api', data: 'D', seq: 4 });
    output({ id: 'other', data: 'x', seq: 9 });
    expect(chunks).toEqual(['AB', 'C', 'D']);

    detach();
    output({ id: 'p:api', data: 'E', seq: 5 });
    expect(chunks).toEqual(['AB', 'C', 'D']);
  });

  it('startAll delegates to main and upserts the sessions', async () => {
    await create();
    await sessions.startAll(project);
    expect(api.startProjectTerminals).toHaveBeenCalledWith('p');
    expect(api.startTerminal).not.toHaveBeenCalled();
    expect(sessions.session('p', 'web')?.status).toBe('running');
  });

  it('stopAll stops every running session of the project, shell included', async () => {
    await create();
    await sessions.stopAll(project);
    expect(api.stopTerminal).toHaveBeenCalledTimes(2);
    expect(api.stopTerminal).toHaveBeenCalledWith('p', 'api');
    expect(api.stopTerminal).toHaveBeenCalledWith('p', 'shell');
  });

  it('forwards write and resize', async () => {
    await create();
    sessions.write('p:api', 'ls');
    sessions.resize('p:api', { cols: 80, rows: 24 });
    expect(api.writeTerminal).toHaveBeenCalledWith('p:api', 'ls');
    expect(api.resizeTerminal).toHaveBeenCalledWith('p:api', {
      cols: 80,
      rows: 24,
    });
  });

  it('is inert in the browser preview', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: undefined }],
    });
    const preview = TestBed.inject(TerminalSessions);
    await preview.startAll(project);
    await preview.stopAll(project);
    const detach = await preview.attach('p:api', () => undefined);
    detach();
    preview.write('p:api', 'x');
    expect(preview.running('p')).toEqual([]);
  });
});
