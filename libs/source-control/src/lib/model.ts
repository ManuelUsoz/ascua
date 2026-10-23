// Provider-agnostic domain model. Keep this lib dependency-free: it is
// imported (types only, from the renderer) by main, preload and renderer.

export const PROVIDER_IDS = ['github'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return (
    typeof value === 'string' &&
    (PROVIDER_IDS as readonly string[]).includes(value)
  );
}

export interface Account {
  provider: ProviderId;
  id: string;
  login: string;
  name?: string;
  avatarUrl?: string;
  webUrl: string;
}

export interface Repository {
  provider: ProviderId;
  /** Opaque to callers. GitHub: "owner/name". */
  id: string;
  name: string;
  owner: string;
  fullName: string;
  description?: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  defaultBranch: string;
  webUrl: string;
  updatedAt: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  author: { login: string; name?: string };
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  updatedAt: string;
  webUrl: string;
  body?: string;
}

export type ReviewEvent = 'approve' | 'requestChanges' | 'comment';

export interface ReviewInput {
  event: ReviewEvent;
  body?: string;
}

export interface Commit {
  sha: string;
  /** First line of the message. */
  title: string;
  message: string;
  author: { name: string; login?: string };
  authoredAt: string;
  webUrl: string;
}

export interface DiffFile {
  path: string;
  previousPath?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed';
  additions: number;
  deletions: number;
  /** Absent for binary or very large files. */
  patch?: string;
}

export interface PullRequestDiff {
  files: DiffFile[];
  truncated: boolean;
}

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page; absent on the last one. */
  next?: string;
}

export interface PageQuery {
  cursor?: string;
}

export interface PullRequestQuery extends PageQuery {
  state?: 'open' | 'closed' | 'all';
}

export interface CommitQuery extends PageQuery {
  branch?: string;
}

/** Main only: never crosses the IPC boundary. */
export interface Credential {
  provider: ProviderId;
  accessToken: string;
  tokenType: string;
  scopes: string[];
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt?: number;
}
