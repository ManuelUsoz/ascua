import type { PullRequest } from '@ascua/source-control';
import { prStateKey, prTone } from './pr-state';

const base: PullRequest = {
  number: 1,
  title: 't',
  state: 'open',
  draft: false,
  author: { login: 'octo' },
  sourceBranch: 'a',
  targetBranch: 'main',
  createdAt: '',
  updatedAt: '',
  webUrl: '',
};

describe('pr-state', () => {
  it.each([
    ['open', false, 'ok', 'repositories.pr.state.open'],
    ['open', true, 'idle', 'repositories.browser.draft'],
    ['merged', false, 'merged', 'repositories.pr.state.merged'],
    ['closed', false, 'alert', 'repositories.pr.state.closed'],
    ['closed', true, 'alert', 'repositories.pr.state.closed'],
  ] as const)('%s draft=%s', (state, draft, tone, key) => {
    const pr = { ...base, state, draft };
    expect(prTone(pr)).toBe(tone);
    expect(prStateKey(pr)).toBe(key);
  });
});
