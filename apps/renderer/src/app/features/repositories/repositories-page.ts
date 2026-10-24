import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorText } from '../../core/i18n/app-error';
import { SourceControlStore } from '../../core/source-control/source-control-store';
import { Spinner } from '../../shared/spinner/spinner';
import { DeviceCode } from './device-code';
import { PROVIDER_OPTIONS } from './providers';
import { RepositoryBrowser } from './repository-browser';

/** Repositorios: connect GitHub, then browse repositories, PRs and commits. */
@Component({
  selector: 'app-repositories-page',
  imports: [TranslocoPipe, DeviceCode, RepositoryBrowser, Spinner],
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
