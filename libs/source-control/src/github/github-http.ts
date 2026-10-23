import { SourceControlError } from '../lib/errors';
import type { FetchLike } from '../lib/ports';

const API = 'https://api.github.com';

export async function githubRequest<T>(
  fetchFn: FetchLike,
  token: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let res: Response;
  try {
    res = await fetchFn(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ascua',
      },
    });
  } catch {
    throw new SourceControlError('network', 'github', 'GitHub is unreachable');
  }

  if (res.ok) return (await res.json()) as T;

  switch (res.status) {
    case 401:
      throw new SourceControlError(
        'unauthorized',
        'github',
        'GitHub rejected the credentials',
      );
    case 403:
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        throw new SourceControlError(
          'rate-limited',
          'github',
          'GitHub rate limit reached',
        );
      }
      throw new SourceControlError('forbidden', 'github', 'Access forbidden');
    case 429:
      throw new SourceControlError(
        'rate-limited',
        'github',
        'GitHub rate limit reached',
      );
    case 404:
      throw new SourceControlError('not-found', 'github', 'Not found');
    default:
      throw new SourceControlError(
        'unknown',
        'github',
        `GitHub responded with ${res.status}`,
      );
  }
}
