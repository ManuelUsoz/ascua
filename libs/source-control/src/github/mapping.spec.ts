import { describe, expect, it } from 'vitest';
import {
  toAccount,
  toCiRun,
  toCiStatus,
  toCommit,
  toPullRequest,
  toRepository,
} from './mapping';

const pull = {
  id: 9,
  number: 3,
  title: 'T',
  state: 'closed',
  user: { login: 'bob' },
  head: { ref: 'feat' },
  base: { ref: 'main' },
  html_url: 'u',
  created_at: 'c',
  updated_at: 'd',
};

describe('github mapping', () => {
  it('maps account and repository', () => {
    expect(
      toAccount({ id: 1, login: 'a', html_url: 'h', avatar_url: 'av' }),
    ).toEqual({
      provider: 'github',
      id: '1',
      login: 'a',
      avatarUrl: 'av',
      webUrl: 'h',
    });
    const repo = toRepository({
      id: 2,
      name: 'r',
      full_name: 'a/r',
      owner: { login: 'a' },
      private: true,
      default_branch: 'main',
      html_url: 'h',
      updated_at: 'u',
    });
    expect(repo.visibility).toBe('private');
    expect(repo.id).toBe('2');
    expect(repo.owner).toBe('a');
  });

  it('maps pull request states and draft', () => {
    expect(toPullRequest({ ...pull, merged_at: 'x' }).state).toBe('merged');
    expect(toPullRequest(pull).state).toBe('closed');
    const open = toPullRequest({ ...pull, state: 'open', draft: true });
    expect(open.state).toBe('open');
    expect(open.draft).toBe(true);
    expect(open.sourceBranch).toBe('feat');
    expect(open.targetBranch).toBe('main');
  });

  it('uses the first message line as commit title', () => {
    const c = toCommit({
      sha: 's',
      html_url: 'h',
      commit: { message: 'first\n\nbody', author: { name: 'N', date: 'D' } },
      author: { login: 'l' },
    });
    expect(c.title).toBe('first');
    expect(c.message).toBe('first\n\nbody');
    expect(c.author).toEqual({ name: 'N', login: 'l' });
    expect(c.authoredAt).toBe('D');
  });

  it('maps every CI status/conclusion pair', () => {
    for (const s of ['queued', 'waiting', 'pending', 'requested']) {
      expect(toCiStatus(s, null)).toBe('queued');
    }
    expect(toCiStatus('in_progress', null)).toBe('running');
    const pairs: [string, string][] = [
      ['success', 'succeeded'],
      ['failure', 'failed'],
      ['timed_out', 'failed'],
      ['startup_failure', 'failed'],
      ['cancelled', 'cancelled'],
      ['skipped', 'skipped'],
      ['neutral', 'skipped'],
      ['action_required', 'unknown'],
    ];
    for (const [conclusion, expected] of pairs) {
      expect(toCiStatus('completed', conclusion)).toBe(expected);
    }
    expect(toCiStatus('weird', null)).toBe('unknown');
  });

  it('maps a CI run', () => {
    const run = toCiRun({
      id: 5,
      name: 'CI',
      status: 'completed',
      conclusion: 'success',
      head_branch: 'main',
      head_sha: 'abc',
      event: 'push',
      html_url: 'h',
      created_at: 'c',
      updated_at: 'u',
    });
    expect(run).toMatchObject({
      id: '5',
      name: 'CI',
      status: 'succeeded',
      branch: 'main',
      trigger: 'push',
      commitSha: 'abc',
    });
  });
});
