import type { Commit, PullRequest, Repository } from '@ascua/source-control';
import type { CrumbItem } from '../../shared/breadcrumb/breadcrumb';
import { repositoryUrl } from './repository-path';

export interface RepositoryCrumbState {
  readonly repo: Repository | undefined;
  readonly pr: PullRequest | undefined;
  readonly commit: Commit | undefined;
}

/**
 * The open PR and commit as the breadcrumb path; undefined when neither is
 * open (the room then names the area).
 */
export function repositoryItems(
  state: RepositoryCrumbState,
  rootLabel: string,
  navigate: (commands: readonly (string | number)[]) => void,
): CrumbItem[] | undefined {
  const { repo, pr, commit } = state;
  if (!pr && !commit) return undefined;
  const items: CrumbItem[] = [
    {
      label: rootLabel,
      go: () => navigate(repo ? repositoryUrl(repo.id) : ['/repositorios']),
    },
  ];
  if (pr) {
    items.push({
      label: pr.sourceBranch,
      mono: true,
      go:
        commit && repo
          ? () => navigate(repositoryUrl(repo.id, pr.number))
          : undefined,
    });
  }
  if (commit) {
    const label = `${commit.sha.slice(0, 7)} ${commit.title}`; // i18n-ignore
    items.push({ label });
  }
  return items;
}
