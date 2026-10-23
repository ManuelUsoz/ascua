import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../lib/ports';
import { GitHubDeviceAuth } from './github-device-auth';

const json = (body: unknown) => new Response(JSON.stringify(body));

const device = {
  device_code: 'SECRET-DEVICE',
  user_code: 'ABCD-1234',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
};

function make(responses: unknown[], now = () => 0) {
  const queue = [...responses];
  const fn = vi.fn(async () => json(queue.shift()));
  const sleep = vi.fn(async () => undefined);
  const auth = new GitHubDeviceAuth({
    clientId: 'cid',
    fetch: fn as unknown as FetchLike,
    sleep,
    now,
  });
  return { auth, fn, sleep };
}

describe('GitHubDeviceAuth', () => {
  it('exposes a challenge without the device code', async () => {
    const { auth, fn } = make([device]);
    const pending = await auth.begin();
    expect(pending.challenge).toEqual({
      kind: 'device-code',
      userCode: 'ABCD-1234',
      verificationUri: device.verification_uri,
      expiresAt: new Date(900_000).toISOString(),
    });
    expect(JSON.stringify(pending.challenge)).not.toContain('SECRET-DEVICE');
    const init = (fn.mock.calls[0] as unknown[])[1] as RequestInit;
    const body = new URLSearchParams(init.body as string);
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('scope')).toBe('repo read:user');
  });

  it('polls pending -> slow_down -> token', async () => {
    const { auth, sleep, fn } = make([
      device,
      { error: 'authorization_pending' },
      { error: 'slow_down' },
      { access_token: 'tok', scope: 'repo,read:user' },
    ]);
    const cred = await (await auth.begin()).complete();
    expect(cred).toMatchObject({
      provider: 'github',
      accessToken: 'tok',
      scopes: ['repo', 'read:user'],
    });
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      5000, 5000, 10000,
    ]);
    const init = (fn.mock.calls[3] as unknown[])[1] as RequestInit;
    const body = new URLSearchParams(init.body as string);
    expect(body.get('device_code')).toBe('SECRET-DEVICE');
    expect(body.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:device_code',
    );
  });

  it('fails on expired_token and access_denied', async () => {
    const a = make([device, { error: 'expired_token' }]);
    await expect((await a.auth.begin()).complete()).rejects.toMatchObject({
      code: 'auth-expired',
    });
    const b = make([device, { error: 'access_denied' }]);
    await expect((await b.auth.begin()).complete()).rejects.toMatchObject({
      code: 'auth-denied',
    });
  });

  it('expires locally past expiresAt', async () => {
    let t = 0;
    const { auth } = make([device], () => t);
    const pending = await auth.begin();
    t = 1_000_000;
    await expect(pending.complete()).rejects.toMatchObject({
      code: 'auth-expired',
    });
  });

  it('retries transient network errors while polling', async () => {
    const { auth, fn } = make([device, { access_token: 'tok' }]);
    const pending = await auth.begin();
    fn.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    const cred = await pending.complete();
    expect(cred.accessToken).toBe('tok');
  });

  it('fails with network after too many consecutive failures', async () => {
    const { auth, fn } = make([device]);
    const pending = await auth.begin();
    fn.mockImplementation(async () => {
      throw new Error('offline');
    });
    await expect(pending.complete()).rejects.toMatchObject({
      code: 'network',
    });
    expect(fn).toHaveBeenCalledTimes(1 + 4);
  });

  it('is cancelled by an aborted signal', async () => {
    const { auth } = make([device]);
    const pending = await auth.begin();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(pending.complete(ctrl.signal)).rejects.toMatchObject({
      code: 'cancelled',
    });
  });
});
