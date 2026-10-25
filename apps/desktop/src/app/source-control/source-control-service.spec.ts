import { describe, expect, it, vi } from 'vitest';
import {
  SourceControlError,
  type Account,
  type Credential,
} from '@ascua/source-control';
import { SourceControlService } from './source-control-service';

const credential: Credential = {
  provider: 'github',
  accessToken: 't',
  tokenType: 'bearer',
  scopes: [],
};
const account: Account = {
  provider: 'github',
  id: '1',
  login: 'me',
  webUrl: 'https://github.com/me',
};

function setup(
  over: {
    stored?: Credential;
    poll?: () => Promise<Credential>;
    getAccount?: () => Promise<Account>;
    uri?: string;
  } = {},
) {
  let held: Credential | undefined =
    'stored' in over ? over.stored : credential;
  const store = {
    load: vi.fn(async () => held),
    save: vi.fn(async (c: Credential) => {
      held = c;
      return true;
    }),
    remove: vi.fn(async () => {
      held = undefined;
    }),
  };
  const provider = {
    id: 'github' as const,
    webOrigin: 'https://github.com',
    cloneUrl: vi.fn((id: string) => `https://github.com/${id}.git`),
    getAccount: vi.fn(over.getAccount ?? (async () => account)),
    listRepositories: vi.fn(async () => ({ items: [] })),
    listPullRequests: vi.fn(),
    listBranches: vi.fn(async () => ({ items: [] })),
    listCommits: vi.fn(),
    getPullRequestDiff: vi.fn(),
    getCommitDiff: vi.fn(async () => ({ files: [], truncated: false })),
    submitReview: vi.fn(),
  };
  const authorizer = {
    start: vi.fn(async () => ({
      deviceCode: 'd',
      userCode: 'ABCD-1234',
      verificationUri: over.uri ?? 'https://github.com/login/device',
      expiresAt: 10,
      intervalMs: 1,
    })),
    poll: vi.fn(over.poll ?? (async () => credential)),
  };
  const send = vi.fn();
  const openExternal = vi.fn();
  const service = new SourceControlService({
    adapters: { github: { provider, authorizer } },
    store,
    send,
    openExternal,
    now: () => 0,
  });
  return { service, store, provider, authorizer, send, openExternal };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('SourceControlService', () => {
  it('builds a clone source with the token only in env', async () => {
    const { service } = setup();
    const source = await service.cloneSource('github', 'me/app');
    expect(source.url).toBe('https://github.com/me/app.git');
    expect(source.url).not.toContain('t@');
    expect(source.env.GIT_CONFIG_COUNT).toBe('1');
    expect(source.env.GIT_CONFIG_KEY_0).toBe(
      'http.https://github.com/.extraheader',
    );
    expect(source.env.GIT_CONFIG_VALUE_0).toBe(
      `AUTHORIZATION: basic ${Buffer.from('x-access-token:t').toString('base64')}`,
    );
  });

  it('refuses a clone source when not connected', async () => {
    const { service } = setup({ stored: undefined });
    await expect(service.cloneSource('github', 'me/app')).rejects.toMatchObject(
      { kind: 'notConnected' },
    );
  });

  it('is disconnected without a credential', async () => {
    const { service } = setup({ stored: undefined });
    expect(await service.status('github')).toEqual({
      provider: 'github',
      state: 'disconnected',
    });
    await expect(service.listRepositories('github')).rejects.toMatchObject({
      kind: 'notConnected',
    });
  });

  it('drops the credential when the token is rejected', async () => {
    const { service, store } = setup({
      getAccount: async () => {
        throw new SourceControlError('authExpired');
      },
    });
    const status = await service.status('github');
    expect(status).toMatchObject({
      state: 'disconnected',
      error: { code: 'sourceControl.authExpired' },
    });
    expect(store.remove).toHaveBeenCalled();
  });

  it('keeps the credential on a network failure', async () => {
    const { service, store } = setup({
      getAccount: async () => {
        throw new SourceControlError('network');
      },
    });
    await expect(service.status('github')).rejects.toMatchObject({
      kind: 'network',
    });
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('connects and announces the account', async () => {
    const { service, send, store } = setup({ stored: undefined });
    const prompt = await service.connect('github');
    expect(prompt.userCode).toBe('ABCD-1234');
    expect((await service.status('github')).state).toBe('connecting');
    await flush();
    expect(store.save).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'ascua:source-control:changed',
      expect.objectContaining({ state: 'connected', persisted: true, account }),
    );
  });

  it('does not persist a token when cancelled while saving', async () => {
    const { service, send, store } = setup({ stored: undefined });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = store.save.getMockImplementation();
    store.save.mockImplementation(async (c: Credential) => {
      await gate;
      return inner ? inner(c) : true;
    });
    await service.connect('github');
    await flush();
    service.cancel('github');
    release();
    await flush();
    expect(await store.load('github')).toBeUndefined();
    expect(send).not.toHaveBeenCalledWith(
      'ascua:source-control:changed',
      expect.objectContaining({ state: 'connected' }),
    );
  });

  it('keeps the newer credential when a superseded attempt finishes', async () => {
    const { service, store, authorizer } = setup({ stored: undefined });
    const newer: Credential = { ...credential, accessToken: 'newer' };
    authorizer.poll
      .mockImplementationOnce(async () => credential)
      .mockImplementationOnce(async () => newer);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inner = store.save.getMockImplementation();
    const gated = async (c: Credential) => {
      await gate;
      return inner ? inner(c) : true;
    };
    // The real store queues saves in order: A's write lands before B's.
    store.save.mockImplementationOnce(gated).mockImplementationOnce(gated);
    await service.connect('github');
    await flush();
    await service.connect('github');
    release();
    await flush();
    expect((await store.load('github'))?.accessToken).toBe('newer');
  });

  it('never sends an unexpected error message to the renderer', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, send } = setup({
      stored: undefined,
      poll: async () => {
        throw new Error('secret detail');
      },
    });
    await service.connect('github');
    await flush();
    expect(send).toHaveBeenCalledWith(
      'ascua:source-control:changed',
      expect.objectContaining({
        state: 'disconnected',
        error: { code: 'unknown' },
      }),
    );
    expect(JSON.stringify(send.mock.calls)).not.toContain('secret detail');
    spy.mockRestore();
  });

  it('announces a denied connection', async () => {
    const { service, send } = setup({
      stored: undefined,
      poll: async () => {
        throw new SourceControlError('denied');
      },
    });
    await service.connect('github');
    await flush();
    expect(send).toHaveBeenCalledWith(
      'ascua:source-control:changed',
      expect.objectContaining({
        state: 'disconnected',
        error: { code: 'sourceControl.denied' },
      }),
    );
  });

  it('serves repeated reads from cache until refresh', async () => {
    const { service, provider } = setup();
    await service.listRepositories('github');
    await service.listRepositories('github');
    expect(provider.listRepositories).toHaveBeenCalledTimes(1);
    await service.listRepositories('github', { refresh: true });
    expect(provider.listRepositories).toHaveBeenCalledTimes(2);
  });

  it('caches branches until refresh', async () => {
    const { service, provider } = setup();
    await service.listBranches('github', 'o/r');
    await service.listBranches('github', 'o/r');
    expect(provider.listBranches).toHaveBeenCalledTimes(1);
    await service.listBranches('github', 'o/r', { refresh: true });
    expect(provider.listBranches).toHaveBeenCalledTimes(2);
  });

  it('caches a commit diff until refresh', async () => {
    const { service, provider } = setup();
    await service.getCommitDiff('github', 'o/r', 'abc1234');
    await service.getCommitDiff('github', 'o/r', 'abc1234');
    expect(provider.getCommitDiff).toHaveBeenCalledTimes(1);
    await service.getCommitDiff('github', 'o/r', 'abc1234', { refresh: true });
    expect(provider.getCommitDiff).toHaveBeenCalledTimes(2);
  });

  it('caches pull request commits apart from branch commits', async () => {
    const { service, provider } = setup();
    await service.listCommits('github', 'o/r', { pullRequest: 7 });
    await service.listCommits('github', 'o/r', { branch: 'dev' });
    expect(provider.listCommits).toHaveBeenCalledTimes(2);
  });

  it('disconnect removes the credential and clears the cache', async () => {
    const { service, store, send, provider } = setup();
    await service.listRepositories('github');
    await service.disconnect('github');
    expect(store.remove).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      'ascua:source-control:changed',
      expect.objectContaining({ state: 'disconnected' }),
    );
    store.load.mockResolvedValue(credential);
    await service.listRepositories('github');
    expect(provider.listRepositories).toHaveBeenCalledTimes(2);
  });

  it('submits a review and clears the cache', async () => {
    const { service, provider } = setup();
    await service.listRepositories('github');
    await service.submitReview('github', 'o/r', 7, { event: 'approve' });
    expect(provider.submitReview).toHaveBeenCalledWith(credential, 'o/r', 7, {
      event: 'approve',
    });
    await service.listRepositories('github');
    expect(provider.listRepositories).toHaveBeenCalledTimes(2);
  });

  it('refuses a review without a credential', async () => {
    const { service, provider } = setup({ stored: undefined });
    await expect(
      service.submitReview('github', 'o/r', 7, { event: 'approve' }),
    ).rejects.toMatchObject({ kind: 'notConnected' });
    expect(provider.submitReview).not.toHaveBeenCalled();
  });

  it('opens web urls only on the provider origin over https', async () => {
    const { service, openExternal } = setup();
    expect(
      await service.openWebUrl('github', 'https://github.com/o/r'),
    ).toBeUndefined();
    expect(openExternal).toHaveBeenCalledWith('https://github.com/o/r');
    expect(
      await service.openWebUrl('github', 'https://evil.test/o/r'),
    ).toBeDefined();
    expect(
      await service.openWebUrl('github', 'http://github.com/o/r'),
    ).toBeDefined();
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it('opens the verification page only over https', async () => {
    const ok = setup();
    await ok.service.connect('github');
    expect(await ok.service.openVerification('github')).toBeUndefined();
    expect(ok.openExternal).toHaveBeenCalledWith(
      'https://github.com/login/device',
    );
    const bad = setup({ uri: 'http://evil.test/x' });
    await bad.service.connect('github');
    expect(await bad.service.openVerification('github')).toBeDefined();
    expect(bad.openExternal).not.toHaveBeenCalled();
  });
});
