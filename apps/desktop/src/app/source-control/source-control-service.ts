import {
  IPC,
  type AscuaError,
  type DeviceCodePrompt,
  type ErrorCode,
  type SourceControlStatus,
} from '@ascua/ipc';
import {
  SourceControlError,
  type Account,
  type Commit,
  type CommitQuery,
  type Credential,
  type DeviceAuthorizer,
  type Page,
  type PageQuery,
  type ProviderId,
  type PullRequest,
  type PullRequestDiff,
  type PullRequestQuery,
  type Repository,
  type ReviewInput,
  type SourceControlProvider,
} from '@ascua/source-control';
import type { SafeStorageCredentialStore } from './credential-store';
import { TtlCache } from './ttl-cache';

export interface ProviderAdapter {
  provider: SourceControlProvider;
  authorizer: DeviceAuthorizer;
}

export interface SourceControlServiceOptions {
  adapters: Record<ProviderId, ProviderAdapter>;
  store: Pick<SafeStorageCredentialStore, 'load' | 'save' | 'remove'>;
  send: (channel: string, payload: unknown) => void;
  openExternal: (url: string) => Promise<void> | void;
  ttlMs?: number;
  now?: () => number;
}

export function toAscuaError(error: unknown): AscuaError {
  if (error instanceof SourceControlError && error.kind !== 'unknown') {
    return {
      code: `sourceControl.${error.kind}` as ErrorCode,
      ...(error.params ? { params: error.params } : {}),
    };
  }
  // The renderer only gets the code; the detail stays in main's log.
  console.error(
    '[source-control] unexpected error:',
    error instanceof Error ? error.message : String(error),
  );
  return { code: 'unknown' };
}

interface Attempt {
  controller: AbortController;
  prompt: DeviceCodePrompt;
  verificationUri: string;
}

export class SourceControlService {
  private readonly attempts = new Map<ProviderId, Attempt>();
  private readonly connects = new Map<ProviderId, number>();
  private readonly persisted = new Map<ProviderId, boolean>();
  private readonly cache: TtlCache;
  private readonly now: () => number;

  constructor(private readonly options: SourceControlServiceOptions) {
    this.now = options.now ?? Date.now;
    this.cache = new TtlCache(options.ttlMs ?? 60_000, this.now);
  }

  async status(provider: ProviderId): Promise<SourceControlStatus> {
    const attempt = this.attempts.get(provider);
    if (attempt)
      return { provider, state: 'connecting', prompt: attempt.prompt };
    const credential = await this.options.store.load(provider);
    if (!credential) return { provider, state: 'disconnected' };
    try {
      const account = await this.cached<Account>(
        provider,
        `${provider}|account`,
        false,
        (c) => this.adapter(provider).provider.getAccount(c),
      );
      return {
        provider,
        state: 'connected',
        account,
        persisted: this.persisted.get(provider) ?? true,
      };
    } catch (error) {
      if (error instanceof SourceControlError && error.kind === 'authExpired') {
        return { provider, state: 'disconnected', error: toAscuaError(error) };
      }
      throw error;
    }
  }

  async connect(provider: ProviderId): Promise<DeviceCodePrompt> {
    const ticket = (this.connects.get(provider) ?? 0) + 1;
    this.connects.set(provider, ticket);
    this.abort(provider);
    const { authorizer, provider: api } = this.adapter(provider);
    const authorization = await authorizer.start();
    const controller = new AbortController();
    const prompt: DeviceCodePrompt = {
      userCode: authorization.userCode,
      verificationUri: authorization.verificationUri,
      expiresAt: authorization.expiresAt,
    };
    const attempt: Attempt = {
      controller,
      prompt,
      verificationUri: authorization.verificationUri,
    };
    this.attempts.set(provider, attempt);
    void (async () => {
      try {
        const credential = await authorizer.poll(
          authorization,
          controller.signal,
        );
        const stale = () =>
          controller.signal.aborted || this.attempts.get(provider) !== attempt;
        const discard = async () => {
          // A newer attempt saves its own credential; leave the store alone.
          if (this.connects.get(provider) !== ticket) return;
          await this.options.store.remove(provider);
          this.persisted.delete(provider);
          this.cache.clear();
        };
        if (stale()) return;
        const persisted = await this.options.store.save(credential);
        if (stale()) return discard();
        this.persisted.set(provider, persisted);
        this.cache.clear();
        const account = await api.getAccount(credential);
        if (stale()) return discard();
        this.attempts.delete(provider);
        this.emit({ provider, state: 'connected', account, persisted });
      } catch (error) {
        if (controller.signal.aborted) return;
        this.attempts.delete(provider);
        this.emit({
          provider,
          state: 'disconnected',
          error: toAscuaError(error),
        });
      }
    })();
    return prompt;
  }

  cancel(provider: ProviderId): void {
    if (!this.attempts.has(provider)) return;
    this.abort(provider);
    this.emit({ provider, state: 'disconnected' });
  }

  async openVerification(
    provider: ProviderId,
  ): Promise<AscuaError | undefined> {
    const attempt = this.attempts.get(provider);
    if (!attempt) return toAscuaError(new SourceControlError('notConnected'));
    let url: URL;
    try {
      url = new URL(attempt.verificationUri);
    } catch {
      return toAscuaError(new SourceControlError('unavailable'));
    }
    if (url.protocol !== 'https:') {
      return toAscuaError(new SourceControlError('unavailable'));
    }
    try {
      await this.options.openExternal(url.toString());
      return undefined;
    } catch (error) {
      return toAscuaError(error);
    }
  }

  async disconnect(provider: ProviderId): Promise<void> {
    this.abort(provider);
    await this.options.store.remove(provider);
    this.persisted.delete(provider);
    this.cache.clear();
    this.emit({ provider, state: 'disconnected' });
  }

  listRepositories(
    provider: ProviderId,
    query: PageQuery & { refresh?: boolean } = {},
  ): Promise<Page<Repository>> {
    const { refresh, ...q } = query;
    return this.cached(provider, key(provider, 'repos', q), refresh, (c) =>
      this.adapter(provider).provider.listRepositories(c, q),
    );
  }

  listPullRequests(
    provider: ProviderId,
    repoId: string,
    query: PullRequestQuery & { refresh?: boolean } = {},
  ): Promise<Page<PullRequest>> {
    const { refresh, ...q } = query;
    return this.cached(
      provider,
      key(provider, 'pulls', repoId, q),
      refresh,
      (c) => this.adapter(provider).provider.listPullRequests(c, repoId, q),
    );
  }

  listCommits(
    provider: ProviderId,
    repoId: string,
    query: CommitQuery & { refresh?: boolean } = {},
  ): Promise<Page<Commit>> {
    const { refresh, ...q } = query;
    return this.cached(
      provider,
      key(provider, 'commits', repoId, q),
      refresh,
      (c) => this.adapter(provider).provider.listCommits(c, repoId, q),
    );
  }

  getPullRequestDiff(
    provider: ProviderId,
    repoId: string,
    number: number,
    query: { refresh?: boolean } = {},
  ): Promise<PullRequestDiff> {
    return this.cached(
      provider,
      key(provider, 'diff', repoId, number),
      query.refresh,
      (c) =>
        this.adapter(provider).provider.getPullRequestDiff(c, repoId, number),
    );
  }

  async submitReview(
    provider: ProviderId,
    repoId: string,
    number: number,
    review: ReviewInput,
  ): Promise<void> {
    const credential = await this.options.store.load(provider);
    if (!credential) throw new SourceControlError('notConnected');
    try {
      await this.adapter(provider).provider.submitReview(
        credential,
        repoId,
        number,
        review,
      );
    } catch (error) {
      await this.handleAuthExpired(provider, error);
      throw error;
    }
    this.cache.clear();
  }

  async openWebUrl(
    provider: ProviderId,
    value: string,
  ): Promise<AscuaError | undefined> {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return toAscuaError(new SourceControlError('unavailable'));
    }
    if (
      url.protocol !== 'https:' ||
      url.origin !== this.adapter(provider).provider.webOrigin
    ) {
      return toAscuaError(new SourceControlError('unavailable'));
    }
    try {
      await this.options.openExternal(url.toString());
      return undefined;
    } catch (error) {
      return toAscuaError(error);
    }
  }

  private adapter(provider: ProviderId): ProviderAdapter {
    return this.options.adapters[provider];
  }

  private abort(provider: ProviderId): void {
    this.attempts.get(provider)?.controller.abort();
    this.attempts.delete(provider);
  }

  private emit(status: SourceControlStatus): void {
    this.options.send(IPC.sourceControlChanged, status);
  }

  private async cached<T>(
    provider: ProviderId,
    cacheKey: string,
    refresh: boolean | undefined,
    fn: (credential: Credential) => Promise<T>,
  ): Promise<T> {
    let credential = await this.options.store.load(provider);
    if (!credential) throw new SourceControlError('notConnected');
    if (!refresh) {
      const hit = this.cache.get<T>(cacheKey);
      if (hit !== undefined) return hit;
    }
    try {
      const { authorizer } = this.adapter(provider);
      if (
        credential.expiresAt !== undefined &&
        credential.expiresAt <= this.now() &&
        authorizer.refresh
      ) {
        credential = await authorizer.refresh(credential);
        this.persisted.set(provider, await this.options.store.save(credential));
      }
      return this.cache.set(cacheKey, await fn(credential));
    } catch (error) {
      await this.handleAuthExpired(provider, error);
      throw error;
    }
  }

  private async handleAuthExpired(
    provider: ProviderId,
    error: unknown,
  ): Promise<void> {
    if (!(error instanceof SourceControlError && error.kind === 'authExpired'))
      return;
    await this.options.store.remove(provider);
    this.persisted.delete(provider);
    this.cache.clear();
    this.emit({
      provider,
      state: 'disconnected',
      error: toAscuaError(error),
    });
  }
}

function key(...parts: unknown[]): string {
  return parts
    .map((p) => (typeof p === 'object' ? JSON.stringify(p) : String(p)))
    .join('|');
}
