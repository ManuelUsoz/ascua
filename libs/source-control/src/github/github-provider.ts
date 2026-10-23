import type { Credential } from '../lib/auth';
import type {
  Account,
  BranchListOptions,
  CiRun,
  Commit,
  ListOptions,
  PullRequest,
  PullRequestListOptions,
  Repository,
  RepositoryRef,
} from '../lib/models';
import type {
  FetchLike,
  ProviderFactory,
  SourceControlProvider,
} from '../lib/ports';
import { SourceControlError } from '../lib/errors';
import { githubRequest } from './github-http';
import type {
  GhCommit,
  GhPull,
  GhRepo,
  GhUser,
  GhWorkflowRunList,
} from './github-types';
import {
  toAccount,
  toCiRun,
  toCommit,
  toPullRequest,
  toRepository,
} from './mapping';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function perPage(opts?: ListOptions): number {
  const n = Math.trunc(opts?.limit ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, n));
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

function repoPath(repo: RepositoryRef): string {
  const parts =
    typeof repo?.fullName === 'string' ? repo.fullName.split('/') : [];
  const [owner, name] = parts;
  if (
    parts.length !== 2 ||
    !OWNER_RE.test(owner) ||
    !REPO_RE.test(name) ||
    name === '.' ||
    name === '..'
  ) {
    throw new SourceControlError(
      'not-found',
      'github',
      'Invalid repository name',
    );
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export class GitHubProvider implements SourceControlProvider {
  readonly id = 'github' as const;
  readonly webOrigin = 'https://github.com';

  constructor(
    private readonly credential: Credential,
    private readonly fetchFn: FetchLike,
  ) {}

  private get<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    return githubRequest<T>(
      this.fetchFn,
      this.credential.accessToken,
      path,
      query,
    );
  }

  async getAccount(): Promise<Account> {
    return toAccount(await this.get<GhUser>('/user'));
  }

  async listRepositories(opts?: ListOptions): Promise<Repository[]> {
    const rows = await this.get<GhRepo[]>('/user/repos', {
      sort: 'updated',
      per_page: perPage(opts),
    });
    return rows.map(toRepository);
  }

  async listPullRequests(
    repo: RepositoryRef,
    opts?: PullRequestListOptions,
  ): Promise<PullRequest[]> {
    const rows = await this.get<GhPull[]>(`${repoPath(repo)}/pulls`, {
      state: opts?.state ?? 'open',
      per_page: perPage(opts),
    });
    return rows.map(toPullRequest);
  }

  async listCommits(
    repo: RepositoryRef,
    opts?: BranchListOptions,
  ): Promise<Commit[]> {
    const rows = await this.get<GhCommit[]>(`${repoPath(repo)}/commits`, {
      sha: opts?.branch,
      per_page: perPage(opts),
    });
    return rows.map(toCommit);
  }

  async listCiRuns(
    repo: RepositoryRef,
    opts?: BranchListOptions,
  ): Promise<CiRun[]> {
    const res = await this.get<GhWorkflowRunList>(
      `${repoPath(repo)}/actions/runs`,
      { branch: opts?.branch, per_page: perPage(opts) },
    );
    return res.workflow_runs.map(toCiRun);
  }
}

export const createGitHubProvider: ProviderFactory = (credential, fetchFn) =>
  new GitHubProvider(credential, fetchFn);
