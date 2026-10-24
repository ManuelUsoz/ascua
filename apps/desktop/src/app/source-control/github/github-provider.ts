import { SourceControlError, isCommitSha } from '@ascua/source-control';
import type {
  Account,
  Branch,
  Commit,
  CommitQuery,
  Credential,
  DiffFile,
  Page,
  PageQuery,
  ProviderId,
  PullRequest,
  CommitDiff,
  PullRequestDiff,
  PullRequestQuery,
  Repository,
  ReviewInput,
  SourceControlProvider,
} from '@ascua/source-control';
import {
  type FetchFn,
  githubFetch,
  nextCursor,
  toSourceControlError,
  validCursor,
} from './github-http';
import {
  toAccount,
  toBranch,
  toCommit,
  toDiffFile,
  toPullRequest,
  toRepository,
} from './github-mappers';

const DIFF_MAX_PAGES = 3;
const REVIEW_BODY_MAX = 65536;
const REVIEW_EVENTS = {
  approve: 'APPROVE',
  requestChanges: 'REQUEST_CHANGES',
  comment: 'COMMENT',
} as const;

export function parseRepoId(repoId: string): string {
  if (typeof repoId !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(repoId)) {
    throw new SourceControlError('notFound');
  }
  const [owner, repo] = repoId.split('/');
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') {
    throw new SourceControlError('notFound');
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export class GitHubProvider implements SourceControlProvider {
  readonly id: ProviderId = 'github';
  readonly webOrigin = 'https://github.com';

  constructor(private readonly fetchFn: FetchFn) {}

  private async get(
    credential: Credential,
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<Response> {
    const response = await githubFetch(this.fetchFn, credential, path, query);
    if (!response.ok) throw toSourceControlError(response);
    return response;
  }

  async getAccount(credential: Credential): Promise<Account> {
    const response = await this.get(credential, '/user');
    return toAccount(await response.json());
  }

  async listRepositories(
    credential: Credential,
    query: PageQuery,
  ): Promise<Page<Repository>> {
    const page = validCursor(query.cursor);
    const response = await this.get(credential, '/user/repos', {
      sort: 'pushed',
      per_page: 50,
      affiliation: 'owner,collaborator,organization_member',
      page,
    });
    const items = (await response.json()) as unknown[];
    return {
      items: items.map(toRepository),
      next: nextCursor(response.headers.get('link')),
    };
  }

  async listPullRequests(
    credential: Credential,
    repoId: string,
    query: PullRequestQuery,
  ): Promise<Page<PullRequest>> {
    const base = parseRepoId(repoId);
    const page = validCursor(query.cursor);
    const state = ['open', 'closed', 'all'].includes(query.state ?? '')
      ? query.state
      : 'open';
    const response = await this.get(credential, `${base}/pulls`, {
      state,
      sort: 'updated',
      direction: 'desc',
      per_page: 30,
      head: query.branch
        ? `${repoId.split('/')[0]}:${query.branch}`
        : undefined,
      page,
    });
    const items = (await response.json()) as unknown[];
    return {
      items: items.map(toPullRequest),
      next: nextCursor(response.headers.get('link')),
    };
  }

  async listCommits(
    credential: Credential,
    repoId: string,
    query: CommitQuery,
  ): Promise<Page<Commit>> {
    const base = parseRepoId(repoId);
    const page = validCursor(query.cursor);
    if (query.pullRequest !== undefined) {
      const n = query.pullRequest;
      if (!Number.isInteger(n) || n < 1) {
        throw new SourceControlError('notFound');
      }
    }
    if (query.pullRequest !== undefined) {
      // A PR has at most 250 commits: follow the pages (100 each) up to the
      // cap and leave the rest as `next`.
      const items: unknown[] = [];
      let cursor: string | undefined = page ?? '1';
      let fetched = 0;
      while (cursor !== undefined && fetched < DIFF_MAX_PAGES) {
        const res = await githubFetch(
          this.fetchFn,
          credential,
          `${base}/pulls/${query.pullRequest}/commits`,
          { per_page: 100, page: cursor },
        );
        if (!res.ok) throw toSourceControlError(res);
        items.push(...((await res.json()) as unknown[]));
        cursor = nextCursor(res.headers.get('link'));
        fetched++;
      }
      return { items: items.map(toCommit), next: cursor };
    }
    const response = await githubFetch(
      this.fetchFn,
      credential,
      `${base}/commits`,
      { per_page: 20, sha: query.branch, page },
    );
    if (response.status === 409) return { items: [] }; // empty repository
    if (!response.ok) throw toSourceControlError(response);
    const items = (await response.json()) as unknown[];
    return {
      items: items.map(toCommit),
      next: nextCursor(response.headers.get('link')),
    };
  }

  async listBranches(
    credential: Credential,
    repoId: string,
    query: PageQuery,
  ): Promise<Page<Branch>> {
    const base = parseRepoId(repoId);
    const page = validCursor(query.cursor);
    const response = await githubFetch(
      this.fetchFn,
      credential,
      `${base}/branches`,
      { per_page: 100, page },
    );
    if (response.status === 409) return { items: [] }; // empty repository
    if (!response.ok) throw toSourceControlError(response);
    const items = (await response.json()) as unknown[];
    return {
      items: items.map(toBranch),
      next: nextCursor(response.headers.get('link')),
    };
  }

  async getPullRequestDiff(
    credential: Credential,
    repoId: string,
    number: number,
  ): Promise<PullRequestDiff> {
    const base = parseRepoId(repoId);
    if (!Number.isInteger(number) || number < 1) {
      throw new SourceControlError('notFound');
    }
    return this.diffPages(
      credential,
      `${base}/pulls/${number}/files`,
      (json) => json as unknown[],
    );
  }

  async getCommitDiff(
    credential: Credential,
    repoId: string,
    sha: string,
  ): Promise<CommitDiff> {
    const base = parseRepoId(repoId);
    if (typeof sha !== 'string' || !isCommitSha(sha)) {
      throw new SourceControlError('notFound');
    }
    return this.diffPages(
      credential,
      `${base}/commits/${sha}`,
      (json) => (json as { files?: unknown[] }).files ?? [],
    );
  }

  private async diffPages(
    credential: Credential,
    path: string,
    pick: (json: unknown) => unknown[],
  ): Promise<PullRequestDiff> {
    const files: DiffFile[] = [];
    let page: string | undefined = '1';
    let fetched = 0;
    while (page !== undefined && fetched < DIFF_MAX_PAGES) {
      const response = await this.get(credential, path, {
        per_page: 100,
        page,
      });
      const items = pick(await response.json());
      files.push(...items.map(toDiffFile));
      page = nextCursor(response.headers.get('link'));
      fetched++;
    }
    return { files, truncated: page !== undefined };
  }

  async submitReview(
    credential: Credential,
    repoId: string,
    number: number,
    review: ReviewInput,
  ): Promise<void> {
    const base = parseRepoId(repoId);
    if (!Number.isInteger(number) || number < 1) {
      throw new SourceControlError('notFound');
    }
    const event = REVIEW_EVENTS[review.event];
    if (!event) throw new SourceControlError('unknown');
    const body = (review.body ?? '').trim();
    if (
      body.length > REVIEW_BODY_MAX ||
      (review.event !== 'approve' && body === '')
    ) {
      throw new SourceControlError('rejected');
    }
    const response = await githubFetch(
      this.fetchFn,
      credential,
      `${base}/pulls/${number}/reviews`,
      {},
      { method: 'POST', body: body ? { event, body } : { event } },
    );
    if (!response.ok) throw toSourceControlError(response);
  }
}
