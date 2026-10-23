import type {
  Account,
  Commit,
  CommitQuery,
  Credential,
  Page,
  PageQuery,
  ProviderId,
  PullRequest,
  PullRequestDiff,
  PullRequestQuery,
  Repository,
  ReviewInput,
} from './model';

/** Stateless: the credential is passed on every call. */
export interface SourceControlProvider {
  readonly id: ProviderId;
  /** Origin of the provider's website, e.g. "https://github.com". */
  readonly webOrigin: string;
  getAccount(credential: Credential): Promise<Account>;
  listRepositories(
    credential: Credential,
    query: PageQuery,
  ): Promise<Page<Repository>>;
  listPullRequests(
    credential: Credential,
    repoId: string,
    query: PullRequestQuery,
  ): Promise<Page<PullRequest>>;
  listCommits(
    credential: Credential,
    repoId: string,
    query: CommitQuery,
  ): Promise<Page<Commit>>;
  getPullRequestDiff(
    credential: Credential,
    repoId: string,
    number: number,
  ): Promise<PullRequestDiff>;
  submitReview(
    credential: Credential,
    repoId: string,
    number: number,
    review: ReviewInput,
  ): Promise<void>;
}

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Epoch ms. */
  expiresAt: number;
  intervalMs: number;
}

export interface DeviceAuthorizer {
  start(): Promise<DeviceAuthorization>;
  /** Resolves with the credential; rejects with the abort reason on abort. */
  poll(
    authorization: DeviceAuthorization,
    signal: AbortSignal,
  ): Promise<Credential>;
  refresh?(credential: Credential): Promise<Credential>;
}
