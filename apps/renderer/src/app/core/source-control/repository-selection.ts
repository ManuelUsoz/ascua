import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { AscuaError } from '@ascua/ipc';
import type {
  Commit,
  PullRequest,
  PullRequestDiff,
  Repository,
} from '@ascua/source-control';
import { errorText, toAscuaError } from '../i18n/app-error';
import type { Text } from '../i18n/text';
import { SourceControlStore } from './source-control-store';

/**
 * What the Repositorios screen is browsing, shared by the room side slot and
 * the screen. Fetched data lives here only while the screen is in use.
 */
@Injectable({ providedIn: 'root' })
export class RepositorySelection {
  private readonly store = inject(SourceControlStore);
  // Guards against a slow answer landing after the user moved on.
  private repoTicket = 0;
  private diffTicket = 0;

  readonly repos = signal<Repository[]>([]);
  readonly nextPage = signal<string | undefined>(undefined);
  readonly reposLoading = signal(false);
  readonly reposError = signal<Text | undefined>(undefined);

  readonly selectedRepo = signal<Repository | undefined>(undefined);
  readonly prs = signal<PullRequest[]>([]);
  readonly prsLoading = signal(false);
  readonly prsError = signal<Text | undefined>(undefined);
  readonly commits = signal<Commit[]>([]);
  readonly commitsLoading = signal(false);
  readonly commitsError = signal<Text | undefined>(undefined);

  readonly selectedPr = signal<PullRequest | undefined>(undefined);
  readonly diff = signal<PullRequestDiff | undefined>(undefined);
  readonly diffLoading = signal(false);
  readonly diffError = signal<Text | undefined>(undefined);
  readonly activeFile = signal<number | undefined>(undefined);
  readonly loadedAt = signal<number | undefined>(undefined);

  constructor() {
    effect(() => {
      const state = this.store.status()?.state;
      if (state && state !== 'connected') untracked(() => this.reset());
    });
  }

  /** Loads the first page, or the next one; selects the first repo if none. */
  async loadRepos(more = false, refresh = false): Promise<void> {
    this.reposLoading.set(true);
    this.reposError.set(undefined);
    try {
      const cursor = more ? this.nextPage() : undefined;
      const page = await this.store.repositories({
        ...(cursor ? { cursor } : {}),
        ...(refresh ? { refresh } : {}),
      });
      this.repos.update((all) => (more ? [...all, ...page.items] : page.items));
      this.nextPage.set(page.next);
      this.loadedAt.set(Date.now());
    } catch (e) {
      this.reposError.set(errorText(asError(e)));
    } finally {
      this.reposLoading.set(false);
    }
    const first = this.repos()[0];
    if (!this.selectedRepo() && first) await this.selectRepo(first);
  }

  selectRepo(repo: Repository): Promise<void> {
    this.clearPr();
    this.selectedRepo.set(repo);
    return this.loadRepo(repo, false);
  }

  selectPr(pr: PullRequest): Promise<void> {
    const repo = this.selectedRepo();
    this.selectedPr.set(pr);
    this.activeFile.set(undefined);
    if (!repo) return Promise.resolve();
    return this.loadDiff(repo, pr, false);
  }

  /** Leaves the open pull request. */
  back(): void {
    this.clearPr();
  }

  /** Reloads everything on screen bypassing the main-side cache. */
  async refresh(): Promise<void> {
    const repo = this.selectedRepo();
    const pr = this.selectedPr();
    await Promise.all([
      this.loadRepos(false, true),
      repo ? this.loadRepo(repo, true) : undefined,
      repo && pr ? this.loadDiff(repo, pr, true) : undefined,
    ]);
  }

  /** Forgets everything (on disconnect). */
  reset(): void {
    this.repoTicket++;
    this.diffTicket++;
    this.repos.set([]);
    this.nextPage.set(undefined);
    this.reposLoading.set(false);
    this.reposError.set(undefined);
    this.selectedRepo.set(undefined);
    this.prs.set([]);
    this.commits.set([]);
    this.prsLoading.set(false);
    this.commitsLoading.set(false);
    this.prsError.set(undefined);
    this.commitsError.set(undefined);
    this.clearPr();
    this.loadedAt.set(undefined);
  }

  private clearPr(): void {
    this.diffTicket++;
    this.selectedPr.set(undefined);
    this.diff.set(undefined);
    this.diffError.set(undefined);
    this.diffLoading.set(false);
    this.activeFile.set(undefined);
  }

  private async loadRepo(repo: Repository, refresh: boolean): Promise<void> {
    const ticket = ++this.repoTicket;
    const current = () => ticket === this.repoTicket;
    const query = refresh ? { refresh } : {};
    this.prs.set([]);
    this.commits.set([]);
    this.prsError.set(undefined);
    this.commitsError.set(undefined);
    this.prsLoading.set(true);
    this.commitsLoading.set(true);
    await Promise.all([
      this.store
        .pullRequests(repo.id, { state: 'open', ...query })
        .then((page) => current() && this.prs.set(page.items))
        .catch((e) => current() && this.prsError.set(errorText(asError(e))))
        .finally(() => current() && this.prsLoading.set(false)),
      this.store
        .commits(repo.id, query)
        .then((page) => current() && this.commits.set(page.items))
        .catch((e) => current() && this.commitsError.set(errorText(asError(e))))
        .finally(() => current() && this.commitsLoading.set(false)),
    ]);
  }

  private async loadDiff(
    repo: Repository,
    pr: PullRequest,
    refresh: boolean,
  ): Promise<void> {
    const ticket = ++this.diffTicket;
    this.diff.set(undefined);
    this.diffError.set(undefined);
    this.diffLoading.set(true);
    try {
      const diff = await this.store.diff(
        repo.id,
        pr.number,
        refresh ? { refresh } : undefined,
      );
      if (ticket === this.diffTicket) this.diff.set(diff);
    } catch (e) {
      if (ticket === this.diffTicket) this.diffError.set(errorText(asError(e)));
    } finally {
      if (ticket === this.diffTicket) this.diffLoading.set(false);
    }
  }
}

/** The store already throws `AscuaError`; anything else is decoded. */
function asError(e: unknown): AscuaError {
  return typeof e === 'object' && e !== null && 'code' in e
    ? (e as AscuaError)
    : toAscuaError(e);
}
