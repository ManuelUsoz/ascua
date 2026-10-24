import { expect, test } from '@playwright/test';
import { useAscua } from './ascua';
import { drive } from './helpers';

// Offline GitHub: net.fetch and shell.openExternal are stubbed in main with
// canned responses (main reads net.fetch at call time).
const ascua = useAscua();
const d = drive(ascua);

const stubGitHub = () =>
  ascua.app.evaluate(({ net, shell }) => {
    const g = globalThis as unknown as {
      __opened: string[];
      __polls: number;
      __reviews: unknown[];
    };
    g.__reviews = [];
    g.__opened = [];
    g.__polls = 0;
    const json = (body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json', ...headers },
      });
    (net as unknown as { fetch: unknown }).fetch = async (
      input: string | { url: string },
      init?: { method?: string; body?: string },
    ) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const p = url.pathname;
      if (p === '/login/device/code') {
        return json({
          device_code: 'dev-code',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 1,
        });
      }
      if (p === '/login/oauth/access_token') {
        g.__polls++;
        return g.__polls === 1
          ? json({ error: 'authorization_pending' })
          : json({
              access_token: 'gho_fake',
              token_type: 'bearer',
              scope: 'repo,read:user',
            });
      }
      if (p === '/user') {
        return json({
          id: 1,
          login: 'octocat',
          name: 'Octo Cat',
          html_url: 'https://github.com/octocat',
        });
      }
      if (p === '/user/repos') {
        return json([
          {
            full_name: 'octocat/hello',
            name: 'hello',
            owner: { login: 'octocat' },
            private: false,
            default_branch: 'main',
            html_url: 'https://github.com/octocat/hello',
            pushed_at: '2026-01-01T00:00:00Z',
          },
        ]);
      }
      if (p === '/repos/octocat/hello/pulls') {
        return json([
          {
            number: 7,
            title: 'Add greeting',
            state: 'open',
            user: { login: 'hubot' },
            head: { ref: 'greet' },
            base: { ref: 'main' },
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
            html_url: 'https://github.com/octocat/hello/pull/7',
          },
        ]);
      }
      if (p === '/repos/octocat/hello/commits') {
        return json([
          {
            sha: 'abcdef1234567890',
            html_url: 'https://github.com/octocat/hello/commit/abcdef1',
            commit: {
              message: 'Initial commit\n\nbody',
              author: { name: 'Octo Cat', date: '2026-01-01T00:00:00Z' },
            },
            author: { login: 'octocat' },
          },
        ]);
      }
      if (p === '/repos/octocat/hello/pulls/7/files') {
        return json([
          {
            filename: 'hello.txt',
            status: 'modified',
            additions: 1,
            deletions: 1,
            patch: '@@ -1 +1 @@\n-hello\n+hello world',
          },
        ]);
      }
      if (p === '/repos/octocat/hello/pulls/7/reviews') {
        if (init?.method !== 'POST') return new Response('{}', { status: 405 });
        g.__reviews.push(JSON.parse(String(init.body ?? '{}')));
        return json({ id: 1, state: 'APPROVED' });
      }
      return new Response('{}', { status: 404 });
    };
    shell.openExternal = async (url: string) => {
      g.__opened.push(url);
    };
  });

test('connect GitHub, browse a repo and its PR diff, then disconnect', async () => {
  await d.open();
  await stubGitHub();
  await d.goto('#/repositorios');
  await d.page.waitForSelector('text=Conecta tu cuenta de GitHub');
  const radios = d.page.locator('.as-connect__providers [role=radio]');
  expect(await radios.count()).toBe(4);
  expect(
    await d.page
      .locator('.as-connect__providers [role=radio]:disabled')
      .count(),
  ).toBe(3);
  await d.shot('repositories-01-disconnected');

  await d.page.click('button:has-text("Conectar GitHub")');
  await d.page.waitForSelector('.as-repos__code');
  expect(await d.page.locator('.as-repos__code').innerText()).toBe('ABCD-1234');
  await d.shot('repositories-02-code');

  await d.page.click('text=Abrir github.com/login/device');
  await d.sleep(300);
  const opened = await ascua.app.evaluate(
    () => (globalThis as unknown as { __opened: string[] }).__opened,
  );
  expect(opened).toEqual(['https://github.com/login/device']);

  await d.page.waitForSelector('.as-current >> text=octocat', {
    timeout: 15_000,
  });
  await d.page.waitForSelector(
    '.as-repos__item[aria-current] >> text=octocat/hello',
  );
  await d.page.waitForSelector('.as-repos__pr >> text=Add greeting');
  await d.page.waitForSelector('.as-repos__commit >> text=Initial commit');
  await d.shot('repositories-03-repo');

  await d.page.click('.as-repos__pr >> text=Add greeting');
  await d.page.waitForSelector('.as-diff__ln--add >> text=hello world');
  await d.page.waitForSelector('.as-diff__ln--del');
  await d.shot('repositories-04-diff');

  await d.page.click('.as-btn--primary:has-text("Aprobar")');
  await d.page.waitForSelector('.as-state:has-text("Aprobado")');
  const reviews = await ascua.app.evaluate(
    () =>
      (globalThis as unknown as { __reviews: { event: string }[] }).__reviews,
  );
  expect(reviews).toHaveLength(1);
  expect(reviews[0].event).toBe('APPROVE');
  await d.shot('repositories-05-approved');

  await d.page.click('button:has-text("Pull requests de hello")');
  await d.page.waitForSelector('.as-repos__pr >> text=Add greeting');
  await d.page.click('.as-current button:has-text("Desconectar")');
  await d.page.waitForSelector('button:has-text("Conectar GitHub")');
  await d.shot('repositories-06-disconnected-again');
});
