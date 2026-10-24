import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import type {
  AscuaApi,
  AscuaError,
  Refreshable,
  SourceControlStatus,
} from '@ascua/ipc';
import type {
  Branch,
  Commit,
  CommitQuery,
  Page,
  PageQuery,
  ProviderId,
  PullRequest,
  PullRequestDiff,
  PullRequestQuery,
  Repository,
  ReviewInput,
} from '@ascua/source-control';
import { ASCUA_API } from '../bridge/ascua-api';
import { toAscuaError } from '../i18n/app-error';

const NO_DESKTOP: AscuaError = { code: 'noDesktop' };

/**
 * The source-control connection (GitHub). Main owns the token; this mirrors
 * the status. Fetched data is not kept here: callers hold what they read.
 */
@Injectable({ providedIn: 'root' })
export class SourceControlStore {
  private readonly api = inject(ASCUA_API);
  private readonly destroyRef = inject(DestroyRef);
  private readonly state = signal<SourceControlStatus | undefined>(undefined);
  private readonly failure = signal<AscuaError | undefined>(undefined);
  private readonly working = signal(false);
  private provider: ProviderId = 'github';
  private subscribed = false;

  readonly status = this.state.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly busy = this.working.asReadonly();
  readonly account = computed(() => {
    const s = this.state();
    return s?.state === 'connected' ? s.account : undefined;
  });

  /** Called on page entry: reads the status and follows later changes. */
  async load(provider: ProviderId = 'github'): Promise<void> {
    const api = this.api;
    if (!api) {
      this.failure.set(NO_DESKTOP);
      return;
    }
    this.provider = provider;
    if (!this.subscribed) {
      this.subscribed = true;
      this.destroyRef.onDestroy(
        api.onSourceControlChanged((status) => {
          if (status.provider === this.provider) this.state.set(status);
        }),
      );
    }
    await this.run(async () => {
      this.state.set(await api.getSourceControlStatus(provider));
    });
  }

  async connect(): Promise<void> {
    const api = this.api;
    if (!api) return this.failure.set(NO_DESKTOP);
    await this.run(async () => {
      const prompt = await api.connectSourceControl(this.provider);
      // The changed event may already have moved on (connected/disconnected).
      if (this.state()?.state !== 'connected') {
        this.state.set({
          provider: this.provider,
          state: 'connecting',
          prompt,
        });
      }
    });
  }

  async cancel(): Promise<void> {
    const api = this.api;
    if (!api) return this.failure.set(NO_DESKTOP);
    await this.run(() => api.cancelSourceControlConnect(this.provider));
  }

  async openVerification(): Promise<void> {
    const api = this.api;
    if (!api) return this.failure.set(NO_DESKTOP);
    await this.run(async () => {
      const error = await api.openSourceControlVerification(this.provider);
      if (error) this.failure.set(error);
    });
  }

  async disconnect(): Promise<void> {
    const api = this.api;
    if (!api) return this.failure.set(NO_DESKTOP);
    await this.run(() => api.disconnectSourceControl(this.provider));
  }

  repositories(query?: PageQuery & Refreshable): Promise<Page<Repository>> {
    return this.call((api) => api.listRepositories(this.provider, query));
  }

  pullRequests(
    repoId: string,
    query?: PullRequestQuery & Refreshable,
  ): Promise<Page<PullRequest>> {
    return this.call((api) =>
      api.listPullRequests(this.provider, repoId, query),
    );
  }

  commits(
    repoId: string,
    query?: CommitQuery & Refreshable,
  ): Promise<Page<Commit>> {
    return this.call((api) => api.listCommits(this.provider, repoId, query));
  }

  branches(
    repoId: string,
    query?: PageQuery & Refreshable,
  ): Promise<Page<Branch>> {
    return this.call((api) => api.listBranches(this.provider, repoId, query));
  }

  diff(
    repoId: string,
    number: number,
    query?: Refreshable,
  ): Promise<PullRequestDiff> {
    return this.call((api) =>
      api.getPullRequestDiff(this.provider, repoId, number, query),
    );
  }

  review(repoId: string, number: number, review: ReviewInput): Promise<void> {
    return this.call((api) =>
      api.submitPullRequestReview(this.provider, repoId, number, review),
    );
  }

  async openUrl(url: string): Promise<void> {
    const error = await this.call((api) =>
      api.openSourceControlUrl(this.provider, url),
    );
    if (error) throw error;
  }

  private async call<T>(fn: (api: AscuaApi) => Promise<T>): Promise<T> {
    const api = this.api;
    if (!api) throw NO_DESKTOP;
    try {
      return await fn(api);
    } catch (e) {
      throw toAscuaError(e);
    }
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    this.working.set(true);
    this.failure.set(undefined);
    try {
      await fn();
    } catch (e) {
      this.failure.set(toAscuaError(e));
    } finally {
      this.working.set(false);
    }
  }
}
