import { TestBed } from '@angular/core/testing';
import type { AscuaApi, SourceControlBridge } from '@ascua/ipc';
import type { Repository, SourceControlStatus } from '@ascua/source-control';
import { ASCUA_API } from '../bridge/ascua-api';
import { SourceControlState } from './source-control-state';

const repo = (name: string): Repository => ({
  provider: 'github',
  id: name,
  owner: 'me',
  name,
  fullName: `me/${name}`,
  visibility: 'private',
  defaultBranch: 'main',
  webUrl: `https://github.com/me/${name}`,
  updatedAt: '2026-01-01T00:00:00Z',
});
const connected: SourceControlStatus = {
  state: 'connected',
  provider: 'github',
  account: { provider: 'github', id: '1', login: 'me', webUrl: 'https://github.com/me' },
};
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('SourceControlState', () => {
  let push: (status: SourceControlStatus) => void;
  let bridge: { [K in keyof SourceControlBridge]: ReturnType<typeof vi.fn> };

  function create(): SourceControlState {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ASCUA_API,
          useValue: { sourceControl: bridge } as unknown as AscuaApi,
        },
      ],
    });
    return TestBed.inject(SourceControlState);
  }

  beforeEach(() => {
    bridge = {
      status: vi.fn(async () => ({ state: 'disconnected' })),
      connect: vi.fn(),
      cancelConnect: vi.fn(async () => undefined),
      openVerification: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      listRepositories: vi.fn(async () => [repo('a'), repo('b')]),
      listPullRequests: vi.fn(async () => []),
      listCommits: vi.fn(async () => []),
      listCiRuns: vi.fn(async () => []),
      openUrl: vi.fn(async () => undefined),
      onStatusChanged: vi.fn((cb) => {
        push = cb;
        return () => undefined;
      }),
    };
  });

  it('does nothing without the bridge', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ASCUA_API, useValue: undefined }],
    });
    const state = TestBed.inject(SourceControlState);
    await state.connect();
    expect(state.status().state).toBe('disconnected');
  });

  it('follows pushed status and loads repositories when connected', async () => {
    const state = create();
    push(connected);
    await flush();
    expect(state.connected()).toBe(true);
    expect(state.repositories()).toHaveLength(2);
  });

  it('exposes the challenge while connecting', async () => {
    const challenge = {
      kind: 'device-code',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresAt: '2026-01-01T00:00:00Z',
    };
    bridge['connect'].mockResolvedValue({
      state: 'connecting',
      provider: 'github',
      challenge,
    });
    const state = create();
    await state.connect();
    expect(state.status()).toMatchObject({ state: 'connecting', challenge });
  });

  it('loads the three lists on select', async () => {
    const state = create();
    push(connected);
    await flush();
    await state.select(repo('a'));
    expect(bridge['listPullRequests']).toHaveBeenCalled();
    expect(bridge['listCommits']).toHaveBeenCalled();
    expect(bridge['listCiRuns']).toHaveBeenCalled();
    expect(state.selected()?.name).toBe('a');
    expect(state.loading()).toBe(false);
  });

  it('discards a late answer for a previous selection', async () => {
    const state = create();
    let release!: (value: never[]) => void;
    bridge['listCommits']
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockResolvedValueOnce([]);
    const first = state.select(repo('a'));
    await state.select(repo('b'));
    release([{ sha: 'stale' }] as never);
    await first;
    expect(state.selected()?.name).toBe('b');
    expect(state.commits()).toEqual([]);
  });

  it('sets error on failure', async () => {
    bridge['listCommits'].mockRejectedValue(new Error('boom'));
    const state = create();
    await state.select(repo('a'));
    expect(state.error()).toBe('boom');
  });

  it('clears everything on disconnect', async () => {
    const state = create();
    push(connected);
    await flush();
    await state.select(repo('a'));
    await state.disconnect();
    expect(state.status().state).toBe('disconnected');
    expect(state.repositories()).toEqual([]);
    expect(state.selected()).toBeUndefined();
  });
});
