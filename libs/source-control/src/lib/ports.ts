import type { Credential, PendingAuth } from './auth';
import type {
  Account,
  BranchListOptions,
  CiRun,
  Commit,
  ListOptions,
  ProviderId,
  PullRequest,
  PullRequestListOptions,
  Repository,
  RepositoryRef,
} from './models';

// Main passes `net.fetch` (system proxy); tests pass a fake.
export type FetchLike = typeof fetch;

export interface SourceControlProvider {
  readonly id: ProviderId;
  readonly webOrigin: string;
  getAccount(): Promise<Account>;
  listRepositories(opts?: ListOptions): Promise<Repository[]>;
  listPullRequests(
    repo: RepositoryRef,
    opts?: PullRequestListOptions,
  ): Promise<PullRequest[]>;
  listCommits(repo: RepositoryRef, opts?: BranchListOptions): Promise<Commit[]>;
  listCiRuns(repo: RepositoryRef, opts?: BranchListOptions): Promise<CiRun[]>;
}

export interface SourceControlAuth {
  readonly provider: ProviderId;
  begin(): Promise<PendingAuth>;
}

export type ProviderFactory = (
  credential: Credential,
  fetch: FetchLike,
) => SourceControlProvider;
