import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  type OnInit,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AsSelect } from '../../shared/select/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorText, toAscuaError } from '../../core/i18n/app-error';
import type { Text } from '../../core/i18n/text';
import { RepositorySelection } from '../../core/source-control/repository-selection';
import { SourceControlStore } from '../../core/source-control/source-control-store';
import { Icon } from '../../shared/icon/icon';
import { Spinner } from '../../shared/spinner/spinner';
import { RelativeTimePipe } from '../../shared/time/relative-time.pipe';
import type { PullRequestDiff } from '@ascua/source-control';
import { PullRequestView } from './pull-request-view';
import { PROVIDER_OPTIONS, termKey } from './providers';

/** Repositories of the account; the selected one lists its PRs and commits. */
@Component({
  selector: 'app-repository-browser',
  imports: [
    FormsModule,
    TranslocoPipe,
    PullRequestView,
    Icon,
    RelativeTimePipe,
    Spinner,
    AsSelect,
  ],
  templateUrl: './repository-browser.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositoryBrowser implements OnInit {
  protected readonly sel = inject(RepositorySelection);
  protected readonly store = inject(SourceControlStore);
  protected readonly lang = toSignal(inject(TranslocoService).langChanges$);
  protected readonly provider = PROVIDER_OPTIONS[0].name;
  protected readonly mono = PROVIDER_OPTIONS[0].mono;
  protected readonly term = termKey(PROVIDER_OPTIONS[0].id);
  protected readonly openError = signal<Text | undefined>(undefined);

  ngOnInit(): void {
    void this.sel.loadRepos();
  }

  protected add(d: PullRequestDiff): number {
    return d.files.reduce((s, f) => s + f.additions, 0);
  }

  protected del(d: PullRequestDiff): number {
    return d.files.reduce((s, f) => s + f.deletions, 0);
  }

  protected async openRepo(url: string): Promise<void> {
    this.openError.set(undefined);
    try {
      await this.store.openUrl(url);
    } catch (e) {
      this.openError.set(errorText(toAscuaError(e)));
    }
  }
}
