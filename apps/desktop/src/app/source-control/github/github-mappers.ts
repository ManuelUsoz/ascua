import type {
  Account,
  Commit,
  DiffFile,
  PullRequest,
  Repository,
} from '@ascua/source-control';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export function toAccount(u: Json): Account {
  return {
    provider: 'github',
    id: String(u.id),
    login: u.login,
    name: u.name ?? undefined,
    avatarUrl: u.avatar_url ?? undefined,
    webUrl: u.html_url,
  };
}

export function toRepository(r: Json): Repository {
  return {
    provider: 'github',
    id: r.full_name,
    name: r.name,
    owner: r.owner?.login ?? String(r.full_name).split('/')[0],
    fullName: r.full_name,
    description: r.description ?? undefined,
    private: !!r.private,
    fork: !!r.fork,
    archived: !!r.archived,
    defaultBranch: r.default_branch,
    webUrl: r.html_url,
    updatedAt: r.pushed_at ?? r.updated_at,
  };
}

export function toPullRequest(p: Json): PullRequest {
  return {
    number: p.number,
    title: p.title,
    state: p.merged_at ? 'merged' : p.state === 'open' ? 'open' : 'closed',
    draft: !!p.draft,
    author: { login: p.user?.login ?? '' },
    sourceBranch: p.head?.ref ?? '',
    targetBranch: p.base?.ref ?? '',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    webUrl: p.html_url,
    body: p.body ?? undefined,
  };
}

export function toCommit(c: Json): Commit {
  const message: string = c.commit?.message ?? '';
  return {
    sha: c.sha,
    title: message.split('\n')[0],
    message,
    author: {
      name: c.commit?.author?.name ?? c.author?.login ?? '',
      login: c.author?.login ?? undefined,
    },
    authoredAt: c.commit?.author?.date ?? '',
    webUrl: c.html_url,
  };
}

const DIFF_STATUS: Record<string, DiffFile['status']> = {
  added: 'added',
  removed: 'removed',
  modified: 'modified',
  renamed: 'renamed',
  copied: 'copied',
};

export function toDiffFile(f: Json): DiffFile {
  return {
    path: f.filename,
    previousPath: f.previous_filename ?? undefined,
    status: DIFF_STATUS[f.status] ?? 'changed',
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
    patch: typeof f.patch === 'string' ? f.patch : undefined,
  };
}
