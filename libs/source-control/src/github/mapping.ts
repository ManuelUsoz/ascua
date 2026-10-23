import type {
  Account,
  CiRun,
  CiRunStatus,
  Commit,
  PullRequest,
  Repository,
  RepositoryVisibility,
} from '../lib/models';
import type {
  GhCommit,
  GhPull,
  GhRepo,
  GhUser,
  GhWorkflowRun,
} from './github-types';

export function toAccount(u: GhUser): Account {
  return {
    provider: 'github',
    id: String(u.id),
    login: u.login,
    ...(u.name ? { name: u.name } : {}),
    ...(u.avatar_url ? { avatarUrl: u.avatar_url } : {}),
    webUrl: u.html_url,
  };
}

export function toRepository(r: GhRepo): Repository {
  const visibility: RepositoryVisibility =
    r.visibility === 'internal'
      ? 'internal'
      : r.private || r.visibility === 'private'
        ? 'private'
        : 'public';
  return {
    provider: 'github',
    id: String(r.id),
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    ...(r.description ? { description: r.description } : {}),
    visibility,
    defaultBranch: r.default_branch,
    webUrl: r.html_url,
    updatedAt: r.updated_at ?? r.pushed_at ?? '',
  };
}

export function toPullRequest(p: GhPull): PullRequest {
  return {
    id: String(p.id),
    number: p.number,
    title: p.title,
    state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed',
    draft: p.draft === true,
    author: {
      name: p.user?.login ?? 'unknown',
      ...(p.user ? { login: p.user.login } : {}),
      ...(p.user?.avatar_url ? { avatarUrl: p.user.avatar_url } : {}),
    },
    sourceBranch: p.head.ref,
    targetBranch: p.base.ref,
    webUrl: p.html_url,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export function toCommit(c: GhCommit): Commit {
  const message = c.commit.message;
  return {
    sha: c.sha,
    title: message.split(/\r?\n/, 1)[0],
    message,
    author: {
      name: c.commit.author?.name ?? c.author?.login ?? 'unknown',
      ...(c.author ? { login: c.author.login } : {}),
      ...(c.author?.avatar_url ? { avatarUrl: c.author.avatar_url } : {}),
    },
    authoredAt: c.commit.author?.date ?? '',
    webUrl: c.html_url,
  };
}

export function toCiStatus(
  status: string | null | undefined,
  conclusion: string | null | undefined,
): CiRunStatus {
  switch (status) {
    case 'queued':
    case 'waiting':
    case 'pending':
    case 'requested':
      return 'queued';
    case 'in_progress':
      return 'running';
    case 'completed':
      switch (conclusion) {
        case 'success':
          return 'succeeded';
        case 'failure':
        case 'timed_out':
        case 'startup_failure':
          return 'failed';
        case 'cancelled':
          return 'cancelled';
        case 'skipped':
        case 'neutral':
          return 'skipped';
        default:
          return 'unknown';
      }
    default:
      return 'unknown';
  }
}

export function toCiRun(r: GhWorkflowRun): CiRun {
  const name = r.name ?? r.display_title ?? 'workflow';
  return {
    id: String(r.id),
    name,
    status: toCiStatus(r.status, r.conclusion),
    ...(r.head_branch ? { branch: r.head_branch } : {}),
    commitSha: r.head_sha,
    ...(r.event ? { trigger: r.event } : {}),
    webUrl: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
