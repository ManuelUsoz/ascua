import {
  computed,
  DestroyRef,
  Injectable,
  inject,
  signal,
} from '@angular/core';
import type {
  CiRun,
  Commit,
  ProviderId,
  PullRequest,
  Repository,
  SourceControlStatus,
} from '@ascua/source-control';
import { ASCUA_API } from '../bridge/ascua-api';

/**
 * The renderer's view of source control. Main owns the connection and the
 * token; this only holds status and the lists it is allowed to see.
 */
@Injectable({ providedIn: 'root' })
export class SourceControlState {
  private readonly bridge = inject(ASCUA_API)?.sourceControl;
  private selectToken = 0;

  readonly status = signal<SourceControlStatus>({ state: 'disconnected' });
  readonly repositories = signal<Repository[]>([]);
  readonly selected = signal<Repository | undefined>(undefined);
  readonly pullRequests = signal<PullRequest[]>([]);
  readonly commits = signal<Commit[]>([]);
  readonly ciRuns = signal<CiRun[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly connected = computed(() => this.status().state === 'connected');

  constructor() {
    const bridge = this.bridge;
    if (!bridge) return;

    let pushed = false;
    const off = bridge.onStatusChanged((status) => {
      pushed = true;
      this.apply(status);
    });
    inject(DestroyRef).onDestroy(off);
    bridge
      .status()
      .then((status) => {
        // A pushed status is newer than this snapshot.
        if (!pushed) this.apply(status);
      })
      .catch((e) => this.fail(e));
  }

  async connect(provider: ProviderId = 'github'): Promise<void> {
    if (!this.bridge) return;
    this.error.set(undefined);
    try {
      this.apply(await this.bridge.connect(provider));
    } catch (e) {
      this.fail(e);
    }
  }

  cancel(): void {
    this.bridge?.cancelConnect().catch((e) => this.fail(e));
  }

  openVerification(): void {
    this.bridge?.openVerification().catch((e) => this.fail(e));
  }

  async disconnect(): Promise<void> {
    if (!this.bridge) return;
    try {
      await this.bridge.disconnect();
    } catch (e) {
      this.fail(e);
    }
    this.apply({ state: 'disconnected' });
  }

  open(url: string): void {
    this.bridge?.openUrl(url).catch((e) => this.fail(e));
  }

  async select(repo: Repository): Promise<void> {
    if (!this.bridge) return;
    const token = ++this.selectToken;
    this.selected.set(repo);
    this.pullRequests.set([]);
    this.commits.set([]);
    this.ciRuns.set([]);
    this.error.set(undefined);
    this.loading.set(true);
    try {
      const [pullRequests, commits, ciRuns] = await Promise.all([
        this.bridge.listPullRequests(repo),
        this.bridge.listCommits(repo),
        this.bridge.listCiRuns(repo),
      ]);
      if (token !== this.selectToken) return;
      this.pullRequests.set(pullRequests);
      this.commits.set(commits);
      this.ciRuns.set(ciRuns);
    } catch (e) {
      if (token !== this.selectToken) return;
      this.fail(e);
    }
    if (token === this.selectToken) this.loading.set(false);
  }

  private apply(status: SourceControlStatus): void {
    const was = this.status().state;
    this.status.set(status);
    if (status.state === 'connected') {
      if (was !== 'connected') void this.loadRepositories();
    } else {
      if (status.state === 'error') this.error.set(status.message);
      // Same state again (e.g. the initial snapshot): keep selection and lists.
      if (was === status.state) return;
      this.selectToken++;
      this.repositories.set([]);
      this.selected.set(undefined);
      this.pullRequests.set([]);
      this.commits.set([]);
      this.ciRuns.set([]);
      this.loading.set(false);
    }
  }

  private async loadRepositories(): Promise<void> {
    if (!this.bridge) return;
    this.loading.set(true);
    try {
      const repositories = await this.bridge.listRepositories();
      if (this.connected()) this.repositories.set(repositories);
    } catch (e) {
      this.fail(e);
    }
    this.loading.set(false);
  }

  private fail(e: unknown): void {
    this.error.set(e instanceof Error ? e.message : String(e));
  }
}
