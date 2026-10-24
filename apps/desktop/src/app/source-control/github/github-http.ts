import { SourceControlError } from '@ascua/source-control';
import type { Credential } from '@ascua/source-control';

export type FetchFn = typeof fetch;

const API = 'https://api.github.com';

export async function githubFetch(
  fetchFn: FetchFn,
  credential: Credential,
  path: string,
  query: Record<string, string | number | undefined> = {},
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Ascua',
        ...(init.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new SourceControlError('network');
  }
  return response;
}

export function toSourceControlError(
  response: Response,
  now: () => number = Date.now,
): SourceControlError {
  const status = response.status;
  if (status === 401) return new SourceControlError('authExpired');
  if (status === 403 || status === 429) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const retryAfter = response.headers.get('retry-after');
    const reset = response.headers.get('x-ratelimit-reset');
    if (remaining === '0' || retryAfter !== null || status === 429) {
      let seconds = 60;
      if (retryAfter !== null && Number.isFinite(Number(retryAfter))) {
        seconds = Number(retryAfter);
      } else if (reset !== null && Number.isFinite(Number(reset))) {
        seconds = Number(reset) - now() / 1000;
      }
      return new SourceControlError('rateLimited', {
        minutes: Math.max(1, Math.ceil(seconds / 60)),
      });
    }
    return new SourceControlError('forbidden');
  }
  if (status === 404) return new SourceControlError('notFound');
  if (status === 422) return new SourceControlError('rejected');
  if (status >= 500) return new SourceControlError('network');
  return new SourceControlError('unknown', undefined, `http ${status}`); // i18n-ignore
}

/** Page number of `rel="next"`, or undefined on the last page. */
export function nextCursor(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  for (const part of linkHeader.split(',')) {
    if (!/rel="next"/.test(part)) continue;
    const match = /<([^>]+)>/.exec(part);
    if (!match) continue;
    try {
      const page = new URL(match[1]).searchParams.get('page');
      if (page && /^\d+$/.test(page)) return page;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function validCursor(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  if (!/^\d{1,6}$/.test(cursor)) throw new SourceControlError('unknown');
  return cursor;
}
