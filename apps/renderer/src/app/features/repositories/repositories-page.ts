import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  type OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorText } from '../../core/i18n/app-error';
import { injectCrumbs } from '../../layout/room/crumbs';
import { RepositorySelection } from '../../core/source-control/repository-selection';
import { SourceControlStore } from '../../core/source-control/source-control-store';
import { Button } from '../../shared/button/button';
import { Spinner } from '../../shared/spinner/spinner';
import { DeviceCode } from './device-code';
import { PROVIDER_OPTIONS } from './providers';
import { RepositoryBrowser } from './repository-browser';

/** Repositorios: connect GitHub, then browse repositories, PRs and commits. */
@Component({
  selector: 'app-repositories-page',
  imports: [TranslocoPipe, DeviceCode, RepositoryBrowser, Spinner, Button],
  templateUrl: './repositories-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositoriesPage implements OnInit {
  protected readonly store = inject(SourceControlStore);
  protected readonly providers = PROVIDER_OPTIONS;
  protected readonly current = PROVIDER_OPTIONS[0];
  protected readonly steps = ['one', 'two', 'three'];
  protected readonly scopes = ['repos', 'prs', 'commits', 'diffs', 'review'];
  protected readonly loading = signal(true);
  private readonly selection = inject(RepositorySelection);
  private readonly router = inject(Router);
  private readonly crumbs = injectCrumbs();

  protected readonly failure = computed(() => {
    const error = this.store.error();
    return error ? errorText(error) : undefined;
  });
  protected readonly disconnected = computed(() => {
    const status = this.store.status();
    return status?.state === 'disconnected' ? status : undefined;
  });
  protected readonly connecting = computed(() => {
    const status = this.store.status();
    return status?.state === 'connecting' ? status : undefined;
  });
  protected readonly connected = computed(() => {
    const status = this.store.status();
    return status?.state === 'connected' ? status : undefined;
  });
  protected readonly statusFailure = computed(() => {
    const error = this.disconnected()?.error;
    return error ? errorText(error) : undefined;
  });

  constructor() {
    effect(() => {
      const { repoId, prNumber, commitSha } = this.crumbs();
      untracked(() => {
        void this.selection.follow({
          ...(repoId ? { repoId } : {}),
          ...(prNumber !== undefined ? { prNumber } : {}),
          ...(commitSha ? { commitSha } : {}),
        });
      });
    });

    effect(() => {
      if (this.crumbs().repoId) return;
      if (this.selection.reposLoading()) return;
      const first = this.selection.repos().length
        ? this.selection.firstRepoId()
        : undefined;
      if (!first) return;
      untracked(() => {
        void this.router.navigate(['/repositorios', first], {
          replaceUrl: true,
        });
      });
    });

    effect(() => {
      if (!this.selection.missing()) return;
      untracked(() => {
        void this.router.navigate(['/repositorios'], { replaceUrl: true });
      });
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      await this.store.load();
    } finally {
      this.loading.set(false);
    }
  }
}
