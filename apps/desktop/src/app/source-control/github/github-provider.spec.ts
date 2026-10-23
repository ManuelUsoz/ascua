import { describe, expect, it } from 'vitest';
import type { Credential } from '@ascua/source-control';
import { GitHubProvider } from './github-provider';

const cred: Credential = {
  provider: 'github',
  accessToken: 'tok',
  tokenType: 'bearer',
  scopes: ['repo'],
};

interface Canned {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function fakeFetch(responses: Canned[] | ((url: string) => Canned)) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  const fn = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const c =
      typeof responses === 'function'
        ? responses(String(input))
        : responses[i++];
    return new Response(JSON.stringify(c.body ?? {}), {
      status: c.status ?? 200,
      headers: c.headers,
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const kind = async (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { kind: string }).kind,
  );

describe('GitHubProvider', () => {
  it('maps the account and sends headers', async () => {
    const { fn, calls } = fakeFetch([
      {
        body: { id: 7, login: 'octo', name: null, html_url: 'https://g/octo' },
      },
    ]);
    const account = await new GitHubProvider(fn).getAccount(cred);
    expect(account).toMatchObject({
      id: '7',
      login: 'octo',
      webUrl: 'https://g/octo',
    });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('maps repositories and the next cursor', async () => {
    const { fn, calls } = fakeFetch([
      {
        body: [
          {
            full_name: 'o/r',
            name: 'r',
            owner: { login: 'o' },
            private: true,
            default_branch: 'main',
            html_url: 'u',
            pushed_at: 'd',
          },
        ],
        headers: {
          link: '<https://api.github.com/user/repos?per_page=50&page=3>; rel="next"',
        },
      },
    ]);
    const page = await new GitHubProvider(fn).listRepositories(cred, {
      cursor: '2',
    });
    expect(page.items[0]).toMatchObject({
      id: 'o/r',
      owner: 'o',
      private: true,
    });
    expect(page.next).toBe('3');
    expect(calls[0].url).toContain('page=2');
    expect(calls[0].url).toContain('sort=pushed');
  });

  it('rejects a bad cursor and bad repo ids before fetching', async () => {
    const { fn, calls } = fakeFetch([]);
    const p = new GitHubProvider(fn);
    expect(await kind(p.listRepositories(cred, { cursor: 'http://x' }))).toBe(
      'unknown',
    );
    expect(await kind(p.listCommits(cred, '../etc/passwd', {}))).toBe(
      'notFound',
    );
    expect(await kind(p.listCommits(cred, 'a/b/c', {}))).toBe('notFound');
    expect(await kind(p.getPullRequestDiff(cred, 'a/b', 0))).toBe('notFound');
    expect(calls).toHaveLength(0);
  });

  it('maps pull request states', async () => {
    const pr = (extra: object) => ({
      number: 1,
      title: 't',
      state: 'closed',
      user: { login: 'u' },
      head: { ref: 's' },
      base: { ref: 'main' },
      ...extra,
    });
    const { fn } = fakeFetch([
      { body: [pr({ merged_at: 'x' }), pr({}), pr({ state: 'open' })] },
    ]);
    const page = await new GitHubProvider(fn).listPullRequests(cred, 'o/r', {});
    expect(page.items.map((p) => p.state)).toEqual([
      'merged',
      'closed',
      'open',
    ]);
  });

  it('uses the first message line as commit title; 409 is an empty page', async () => {
    const { fn } = fakeFetch([
      {
        body: [
          {
            sha: 'a',
            commit: { message: 'one\n\ntwo', author: { name: 'N', date: 'd' } },
          },
        ],
      },
      { status: 409 },
    ]);
    const p = new GitHubProvider(fn);
    const page = await p.listCommits(cred, 'o/r', { branch: 'dev' });
    expect(page.items[0].title).toBe('one');
    expect(await p.listCommits(cred, 'o/r', {})).toEqual({ items: [] });
  });

  it('maps errors', async () => {
    const run = (c: Canned) =>
      kind(new GitHubProvider(fakeFetch([c]).fn).getAccount(cred));
    expect(await run({ status: 401 })).toBe('authExpired');
    expect(
      await run({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    ).toBe('rateLimited');
    expect(await run({ status: 403 })).toBe('forbidden');
    expect(await run({ status: 404 })).toBe('notFound');
    const failing = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await kind(new GitHubProvider(failing).getAccount(cred))).toBe(
      'network',
    );
  });

  it('maps the pull request body', async () => {
    const { fn } = fakeFetch([
      {
        body: [
          { number: 1, title: 't', state: 'open', body: 'hello' },
          { number: 2, title: 't', state: 'open', body: null },
        ],
      },
    ]);
    const page = await new GitHubProvider(fn).listPullRequests(cred, 'o/r', {});
    expect(page.items.map((p) => p.body)).toEqual(['hello', undefined]);
  });

  it('posts the three review events', async () => {
    const { fn, calls } = fakeFetch(() => ({}));
    const p = new GitHubProvider(fn);
    await p.submitReview(cred, 'o/r', 7, { event: 'approve' });
    await p.submitReview(cred, 'o/r', 7, {
      event: 'requestChanges',
      body: '  fix it ',
    });
    await p.submitReview(cred, 'o/r', 7, { event: 'comment', body: 'hi' });
    expect(calls.map((c) => c.init?.method)).toEqual(['POST', 'POST', 'POST']);
    expect(calls[0].url).toBe(
      'https://api.github.com/repos/o/r/pulls/7/reviews',
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      event: 'APPROVE',
    });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      event: 'REQUEST_CHANGES',
      body: 'fix it',
    });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({
      event: 'COMMENT',
      body: 'hi',
    });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('refuses an empty review body and a bad number before fetching', async () => {
    const { fn, calls } = fakeFetch([]);
    const p = new GitHubProvider(fn);
    expect(
      await kind(
        p.submitReview(cred, 'o/r', 7, { event: 'comment', body: ' ' }),
      ),
    ).toBe('rejected');
    expect(
      await kind(p.submitReview(cred, 'o/r', 7, { event: 'requestChanges' })),
    ).toBe('rejected');
    expect(
      await kind(p.submitReview(cred, 'o/r', 0, { event: 'approve' })),
    ).toBe('notFound');
    expect(calls).toHaveLength(0);
  });

  it('maps 422 to rejected', async () => {
    const { fn } = fakeFetch([{ status: 422 }]);
    expect(
      await kind(
        new GitHubProvider(fn).submitReview(cred, 'o/r', 7, {
          event: 'approve',
        }),
      ),
    ).toBe('rejected');
  });

  it('truncates the diff after 3 pages', async () => {
    const { fn, calls } = fakeFetch((url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      return {
        body: [
          { filename: `f${page}`, status: 'weird', additions: 1, deletions: 2 },
        ],
        headers: {
          link: `<https://api.github.com/x?page=${page + 1}>; rel="next"`,
        },
      };
    });
    const diff = await new GitHubProvider(fn).getPullRequestDiff(
      cred,
      'o/r',
      5,
    );
    expect(calls).toHaveLength(3);
    expect(diff.truncated).toBe(true);
    expect(diff.files.map((f) => f.path)).toEqual(['f1', 'f2', 'f3']);
    expect(diff.files[0].status).toBe('changed');
  });
});
