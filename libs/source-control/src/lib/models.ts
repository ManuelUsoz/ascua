// Provider-agnostic domain: only what GitHub, GitLab, Bitbucket and Azure
// DevOps share. Ids are strings and dates ISO strings so every value
// survives IPC structured clone.

export type ProviderId = 'github';

export interface Account {
  provider: ProviderId;
  id: string;
  login: string;
  name?: string;
  avatarUrl?: string;
  webUrl: string;
}

export type RepositoryVisibility = 'public' | 'private' | 'internal';

export interface Repository {
  provider: ProviderId;
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  visibility: RepositoryVisibility;
  defaultBranch: string;
  webUrl: string;
  updatedAt: string;
}

export type RepositoryRef = Pick<Repository, 'provider' | 'id' | 'fullName'>;

export interface Person {
  name: string;
  login?: string;
  avatarUrl?: string;
}

export type PullRequestState = 'open' | 'closed' | 'merged';

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  state: PullRequestState;
  draft: boolean;
  author: Person;
  sourceBranch: string;
  targetBranch: string;
  webUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface Commit {
  sha: string;
  title: string;
  message: string;
  author: Person;
  authoredAt: string;
  webUrl: string;
}

export type CiRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'unknown';

export interface CiRun {
  id: string;
  name: string;
  status: CiRunStatus;
  branch?: string;
  commitSha: string;
  trigger?: string;
  webUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListOptions {
  limit?: number;
}

export interface PullRequestListOptions extends ListOptions {
  state?: 'open' | 'all';
}

export interface BranchListOptions extends ListOptions {
  branch?: string;
}
