import { ipcMain } from 'electron';
import { IPC } from '@ascua/ipc';
import {
  isSourceControlError,
  type AuthChallenge,
  type CiRun,
  type Commit,
  type Credential,
  type FetchLike,
  type ProviderFactory,
  type ProviderId,
  type PullRequest,
  type Repository,
  type RepositoryRef,
  type SourceControlAuth,
  type SourceControlProvider,
  type SourceControlStatus,
} from '@ascua/source-control';
import type { CredentialStore } from './credential-store';

export interface SourceControlServiceOptions {
  store: CredentialStore;
  auths: Partial<Record<ProviderId, SourceControlAuth>>;
  factories: Partial<Record<ProviderId, ProviderFactory>>;
  fetch: FetchLike;
  notify: (status: SourceControlStatus) => void;
  openExternal: (url: string) => Promise<void>;
}

const WEB_ORIGINS: Record<ProviderId, string> = {
  github: 'https://github.com',
};

function readable(error: unknown): string {
  if (isSourceControlError(error)) {
    switch (error.code) {
      case 'unauthorized':
        return 'The GitHub session is no longer valid. Connect again.';
      case 'forbidden':
        return 'GitHub denied access to this resource.';
      case 'not-found':
        return 'The resource was not found.';
      case 'rate-limited':
        return 'GitHub rate limit reached. Try again later.';
      case 'network':
        return 'Could not reach GitHub. Check your connection.';
      case 'auth-expired':
        return 'The code expired. Start the connection again.';
      case 'auth-denied':
        return 'Access was denied on GitHub.';
      case 'cancelled':
        return 'Connection cancelled.';
      default:
        return 'Unexpected source control error.';
    }
  }
  return 'Unexpected source control error.';
}

export class SourceControlService {
  private status: SourceControlStatus = { state: 'disconnected' };
  private provider: SourceControlProvider | null = null;
  private pending: AbortController | null = null;
  private challenge: AuthChallenge | null = null;

  constructor(private readonly opts: SourceControlServiceOptions) {}

  getStatus(): SourceControlStatus {
    return this.status;
  }

  private set(status: SourceControlStatus): SourceControlStatus {
    this.status = status;
    this.opts.notify(status);
    return status;
  }

  private connected(credential: Credential): Promise<SourceControlStatus> {
    const factory = this.opts.factories[credential.provider];
    if (!factory) {
      return Promise.resolve(
        this.set({
          state: 'error',
          provider: credential.provider,
          message: 'Provider not supported.',
        }),
      );
    }
    const provider = factory(credential, this.opts.fetch);
    return provider.getAccount().then(
      (account) => {
        this.provider = provider;
        return this.set({
          state: 'connected',
          provider: credential.provider,
          account,
        });
      },
      (error: unknown) => {
        if (isSourceControlError(error) && error.code === 'unauthorized') {
          this.opts.store.clear(credential.provider);
          return this.set({ state: 'disconnected' });
        }
        return this.set({
          state: 'error',
          provider: credential.provider,
          message: readable(error),
        });
      },
    );
  }

  async restore(): Promise<void> {
    for (const id of Object.keys(this.opts.factories) as ProviderId[]) {
      const credential = this.opts.store.load(id);
      if (credential) {
        await this.connected(credential);
        return;
      }
    }
  }

  async connect(id: ProviderId): Promise<SourceControlStatus> {
    const auth = this.opts.auths[id];
    if (!auth) {
      return this.set({
        state: 'error',
        provider: id,
        message: 'GitHub client ID is not configured',
      });
    }
    this.pending?.abort();
    const controller = new AbortController();
    this.pending = controller;
    let started;
    try {
      started = await auth.begin();
    } catch (error) {
      this.pending = null;
      return this.set({ state: 'error', provider: id, message: readable(error) });
    }
    if (controller.signal.aborted) return this.status;
    this.challenge = started.challenge;
    const connecting = this.set({
      state: 'connecting',
      provider: id,
      challenge: started.challenge,
    });

    void started.complete(controller.signal).then(
      async (credential) => {
        if (this.pending !== controller) return;
        this.pending = null;
        this.challenge = null;
        this.opts.store.save(credential);
        await this.connected(credential);
      },
      (error: unknown) => {
        if (this.pending !== controller) return;
        this.pending = null;
        this.challenge = null;
        if (isSourceControlError(error) && error.code === 'cancelled') {
          this.set({ state: 'disconnected' });
        } else {
          this.set({ state: 'error', provider: id, message: readable(error) });
        }
      },
    );
    return connecting;
  }

  cancelConnect(): void {
    if (!this.pending) return;
    const controller = this.pending;
    this.pending = null;
    this.challenge = null;
    controller.abort();
    this.set({ state: 'disconnected' });
  }

  async openVerification(): Promise<void> {
    if (!this.challenge) return;
    const status = this.status;
    const origin =
      status.state === 'connecting' ? WEB_ORIGINS[status.provider] : undefined;
    if (!origin) throw new Error('URL not allowed');
    await this.openChecked(this.challenge.verificationUri, origin);
  }

  disconnect(): void {
    this.pending?.abort();
    this.pending = null;
    this.challenge = null;
    const ids = new Set<ProviderId>([
      ...(Object.keys(this.opts.factories) as ProviderId[]),
      ...(Object.keys(this.opts.auths) as ProviderId[]),
    ]);
    if (this.provider) ids.add(this.provider.id);
    for (const id of ids) this.opts.store.clear(id);
    this.provider = null;
    this.set({ state: 'disconnected' });
  }

  private async run<T>(
    call: (provider: SourceControlProvider) => Promise<T>,
  ): Promise<T> {
    const provider = this.provider;
    if (!provider) throw new Error('Not connected');
    try {
      return await call(provider);
    } catch (error) {
      if (isSourceControlError(error) && error.code === 'unauthorized') {
        this.opts.store.clear(provider.id);
        this.provider = null;
        this.set({ state: 'disconnected' });
      }
      throw new Error(readable(error));
    }
  }

  listRepositories(): Promise<Repository[]> {
    return this.run((p) => p.listRepositories());
  }

  listPullRequests(repo: RepositoryRef): Promise<PullRequest[]> {
    return this.run((p) => p.listPullRequests(repo));
  }

  listCommits(repo: RepositoryRef): Promise<Commit[]> {
    return this.run((p) => p.listCommits(repo));
  }

  listCiRuns(repo: RepositoryRef): Promise<CiRun[]> {
    return this.run((p) => p.listCiRuns(repo));
  }

  async openUrl(url: string): Promise<void> {
    if (!this.provider) throw new Error('Not connected');
    await this.openChecked(url, this.provider.webOrigin);
  }

  private async openChecked(url: string, webOrigin: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== new URL(webOrigin).origin
    ) {
      throw new Error('URL not allowed');
    }
    await this.opts.openExternal(parsed.href);
  }

  register(): void {
    ipcMain.handle(IPC.sourceControlStatus, () => this.getStatus());
    ipcMain.handle(IPC.sourceControlConnect, (_e, provider: ProviderId) =>
      this.connect(provider),
    );
    ipcMain.handle(IPC.sourceControlCancel, () => this.cancelConnect());
    ipcMain.handle(IPC.sourceControlOpenVerification, () =>
      this.openVerification(),
    );
    ipcMain.handle(IPC.sourceControlDisconnect, () => this.disconnect());
    ipcMain.handle(IPC.sourceControlRepositories, () =>
      this.listRepositories(),
    );
    ipcMain.handle(IPC.sourceControlPullRequests, (_e, repo: RepositoryRef) =>
      this.listPullRequests(repo),
    );
    ipcMain.handle(IPC.sourceControlCommits, (_e, repo: RepositoryRef) =>
      this.listCommits(repo),
    );
    ipcMain.handle(IPC.sourceControlCiRuns, (_e, repo: RepositoryRef) =>
      this.listCiRuns(repo),
    );
    ipcMain.handle(IPC.sourceControlOpenUrl, (_e, url: string) =>
      this.openUrl(url),
    );
  }
}
