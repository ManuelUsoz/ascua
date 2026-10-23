import { describe, expect, it, vi } from 'vitest';
import { isSourceControlError } from '../lib/errors';
import type { FetchLike } from '../lib/ports';
import { GitHubProvider } from './github-provider';

const cred = {
  provider: 'github' as const,
  accessToken: 'tok',
  scopes: [],
  obtainedAt: '',
};
const repo = { provider: 'github' as const, id: '1', fullName: 'o-w/r.x_y' };

function make(res: Response | Error) {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  return { fn, provider: new GitHubProvider(cred, fn as unknown as FetchLike) };
}

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), init);

function calledUrl(fn: ReturnType<typeof vi.fn>): URL {
  return new URL((fn.mock.calls[0] as unknown[])[0] as string);
}

describe('GitHubProvider', () => {
  it('sends auth headers and lists repositories', async () => {
    const { fn, provider } = make(json([]));
    await provider.listRepositories();
    const url = calledUrl(fn);
    expect(url.pathname).toBe('/user/repos');
    expect(url.searchParams.get('sort')).toBe('updated');
    expect(url.searchParams.get('per_page')).toBe('30');
    const init = (fn.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ascua',
    });
  });

  it('clamps the limit', async () => {
    const hi = make(json([]));
    await hi.provider.listRepositories({ limit: 500 });
    expect(calledUrl(hi.fn).searchParams.get('per_page')).toBe('100');
    const lo = make(json([]));
    await lo.provider.listRepositories({ limit: 0 });
    expect(calledUrl(lo.fn).searchParams.get('per_page')).toBe('1');
  });

  it('builds pulls, commits and runs URLs with encoding', async () => {
    const p = make(json([]));
    await p.provider.listPullRequests(repo);
    expect(calledUrl(p.fn).pathname).toBe('/repos/o-w/r.x_y/pulls');
    expect(calledUrl(p.fn).searchParams.get('state')).toBe('open');

    const pa = make(json([]));
    await pa.provider.listPullRequests(repo, { state: 'all' });
    expect(calledUrl(pa.fn).searchParams.get('state')).toBe('all');

    const c = make(json([]));
    await c.provider.listCommits(repo);
    expect(calledUrl(c.fn).searchParams.has('sha')).toBe(false);
    const cb = make(json([]));
    await cb.provider.listCommits(repo, { branch: 'dev' });
    expect(calledUrl(cb.fn).searchParams.get('sha')).toBe('dev');

    const r = make(json({ workflow_runs: [] }));
    expect(await r.provider.listCiRuns(repo, { branch: 'dev' })).toEqual([]);
    expect(calledUrl(r.fn).pathname).toBe('/repos/o-w/r.x_y/actions/runs');
    expect(calledUrl(r.fn).searchParams.get('branch')).toBe('dev');
  });

  it.each([
    [401, {}, 'unauthorized'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rate-limited'],
    [429, {}, 'rate-limited'],
    [403, {}, 'forbidden'],
    [404, {}, 'not-found'],
    [500, {}, 'unknown'],
  ])('maps status %i %j to %s', async (status, headers, code) => {
    const { provider } = make(json({}, { status, headers }));
    const err = await provider.getAccount().catch((e) => e);
    expect(isSourceControlError(err)).toBe(true);
    expect(err.code).toBe(code);
    expect(err.message).not.toContain('tok');
  });

  it.each(['../x', 'a/b/c', 'a', 'a/..', 'a/.', '-a/b', 'a/b c'])(
    'rejects invalid repository %j without fetching',
    async (fullName) => {
      const bad = { ...repo, fullName };
      const { fn, provider } = make(json([]));
      for (const call of [
        () => provider.listPullRequests(bad),
        () => provider.listCommits(bad),
        () => provider.listCiRuns(bad),
      ]) {
        const err = await call().catch((e) => e);
        expect(isSourceControlError(err)).toBe(true);
        expect(err.code).toBe('not-found');
        expect(err.provider).toBe('github');
      }
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it('maps a thrown fetch to network', async () => {
    const { provider } = make(new Error('boom tok'));
    const err = await provider.getAccount().catch((e) => e);
    expect(err.code).toBe('network');
    expect(err.message).not.toContain('tok');
  });
});
