import { describe, expect, it } from 'vitest';
import { GitHubDeviceFlow } from './github-device-flow';

function setup(tokenReplies: object[], now = () => 1000) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const delays: number[] = [];
  let i = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    const body = new URLSearchParams(String(init.body));
    calls.push({ url, body });
    if (url.endsWith('/device/code')) {
      return Response.json({
        device_code: 'dc',
        user_code: 'AB-12',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      });
    }
    return Response.json(tokenReplies[i++]);
  }) as unknown as typeof fetch;
  const flow = new GitHubDeviceFlow({
    fetch: fetchFn,
    clientId: 'cid',
    scopes: ['repo', 'read:user'],
    sleep: async (ms) => {
      delays.push(ms);
    },
    now,
  });
  return { flow, calls, delays };
}

const auth = {
  deviceCode: 'dc',
  userCode: 'u',
  verificationUri: 'v',
  expiresAt: 10_000_000,
  intervalMs: 5000,
};

describe('GitHubDeviceFlow', () => {
  it('starts with the requested scopes', async () => {
    const { flow, calls } = setup([]);
    const a = await flow.start();
    expect(calls[0].body.get('scope')).toBe('repo read:user');
    expect(calls[0].body.get('client_id')).toBe('cid');
    expect(a).toMatchObject({
      deviceCode: 'dc',
      userCode: 'AB-12',
      expiresAt: 1000 + 900_000,
      intervalMs: 5000,
    });
  });

  it('polls through pending and slow_down, then returns the credential', async () => {
    const { flow, delays, calls } = setup([
      { error: 'authorization_pending' },
      { error: 'slow_down' },
      { access_token: 'tok', token_type: 'bearer', scope: 'repo,read:user' },
    ]);
    const c = await flow.poll(auth, new AbortController().signal);
    expect(delays).toEqual([5000, 5000, 10000]);
    expect(c).toEqual({
      provider: 'github',
      accessToken: 'tok',
      tokenType: 'bearer',
      scopes: ['repo', 'read:user'],
    });
    expect(calls[0].body.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:device_code',
    );
  });

  it.each([
    ['expired_token', 'codeExpired'],
    ['access_denied', 'denied'],
    ['device_flow_disabled', 'unavailable'],
  ])('maps %s', async (error, kind) => {
    const { flow } = setup([{ error }]);
    await expect(
      flow.poll(auth, new AbortController().signal),
    ).rejects.toMatchObject({ kind });
  });

  it('expires locally', async () => {
    const { flow } = setup([], () => 20_000_000);
    await expect(
      flow.poll(auth, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'codeExpired' });
  });

  it('rejects with the abort reason', async () => {
    const { flow } = setup([{ error: 'authorization_pending' }]);
    const ctl = new AbortController();
    ctl.abort('stop');
    await expect(flow.poll(auth, ctl.signal)).rejects.toBe('stop');
  });
});
