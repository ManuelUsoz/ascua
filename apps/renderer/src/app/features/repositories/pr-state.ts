import type { PullRequest } from '@ascua/source-control';

export type PrTone = 'ok' | 'merged' | 'alert' | 'idle';

/** Colour of a pull request state; the state wins over draft. */
export function prTone(pr: PullRequest): PrTone {
  if (pr.state === 'merged') return 'merged';
  if (pr.state === 'closed') return 'alert';
  return pr.draft ? 'idle' : 'ok';
}

/** Transloco key of the state label; only an open draft says draft. */
export function prStateKey(pr: PullRequest): string {
  return pr.state === 'open' && pr.draft
    ? 'repositories.browser.draft'
    : `repositories.pr.state.${pr.state}`;
}
