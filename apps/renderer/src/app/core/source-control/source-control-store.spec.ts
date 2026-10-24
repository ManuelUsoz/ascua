import { TestBed } from '@angular/core/testing';
import { encodeError, type SourceControlStatus } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { SourceControlStore } from './source-control-store';

const prompt = {
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  expiresAt: 1,
};
const disconnected: SourceControlStatus = {
  provider: 'github',
  state: 'disconnected',
};

function setup(api: unknown): SourceControlStore {
  TestBed.configureTestingModule({
    providers: [{ provide: ASCUA_API, useValue: api }],
  });
  return TestBed.inject(SourceControlStore);
}

describe('SourceControlStore', () => {
  let changed: (status: SourceControlStatus) => void;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      getSourceControlStatus: vi.fn(async () => disconnected),
      connectSourceControl: vi.fn(async () => prompt),
      onSourceControlChanged: vi.fn((cb) => {
        changed = cb;
        return () => undefined;
      }),
      listRepositories: vi.fn(async () => ({ items: [] })),
    };
  });

  it('loads the status and follows changes', async () => {
    const store = setup(api);
    await store.load();
    expect(store.status()).toEqual(disconnected);
    changed({
      provider: 'github',
      state: 'connecting',
      prompt,
    });
    expect(store.status()?.state).toBe('connecting');
    expect(api['onSourceControlChanged']).toHaveBeenCalledTimes(1);
    await store.load();
    expect(api['onSourceControlChanged']).toHaveBeenCalledTimes(1);
  });

  it('connect moves to connecting', async () => {
    const store = setup(api);
    await store.load();
    await store.connect();
    expect(store.status()).toEqual({
      provider: 'github',
      state: 'connecting',
      prompt,
    });
    expect(store.busy()).toBe(false);
  });

  it('decodes error codes', async () => {
    api['connectSourceControl'] = vi.fn(async () => {
      throw new Error(encodeError({ code: 'sourceControl.denied' }));
    });
    const store = setup(api);
    await store.connect();
    expect(store.error()).toEqual({ code: 'sourceControl.denied' });

    api['listRepositories'] = vi.fn(async () => {
      throw new Error(encodeError({ code: 'sourceControl.rateLimited' }));
    });
    await expect(store.repositories()).rejects.toEqual({
      code: 'sourceControl.rateLimited',
    });
  });

  it('passes reviews and urls through', async () => {
    api['submitPullRequestReview'] = vi.fn(async () => undefined);
    api['openSourceControlUrl'] = vi.fn(async () => undefined);
    const store = setup(api);
    await store.review('o/r', 7, { event: 'approve' });
    expect(api['submitPullRequestReview']).toHaveBeenCalledWith(
      'github',
      'o/r',
      7,
      { event: 'approve' },
    );
    await store.openUrl('https://github.com/o/r');
    expect(api['openSourceControlUrl']).toHaveBeenCalledWith(
      'github',
      'https://github.com/o/r',
    );
    api['openSourceControlUrl'] = vi.fn(async () => ({
      code: 'sourceControl.unavailable',
    }));
    await expect(store.openUrl('https://x.com')).rejects.toEqual({
      code: 'sourceControl.unavailable',
    });
  });

  it('reports noDesktop without the bridge', async () => {
    const store = setup(undefined);
    await store.load();
    expect(store.error()).toEqual({ code: 'noDesktop' });
    await expect(store.repositories()).rejects.toEqual({
      code: 'noDesktop',
    });
  });
});
