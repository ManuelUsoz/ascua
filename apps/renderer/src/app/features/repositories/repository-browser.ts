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
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { Spinner } from '../../shared/spinner/spinner';
import { RelativeTimePipe } from '../../shared/time/relative-time.pipe';
import { Router } from '@angular/router';
import type {
  Commit,
  PullRequest,
  PullRequestDiff,
} from '@ascua/source-control';
import { CommitDiffView } from './commit-diff-view';
import { CommitRow } from './commit-row';
import { PullRequestView } from './pull-request-view';
import { PROVIDER_OPTIONS, termKey } from './providers';
import { prStateKey, prTone } from './pr-state';
import { repositoryUrl } from './repository-path';

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
    Button,
    CommitRow,
    CommitDiffView,
  ],
  templateUrl: './repository-browser.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositoryBrowser implements OnInit {
  private readonly router = inject(Router);
  protected readonly sel = inject(RepositorySelection);
  protected readonly store = inject(SourceControlStore);
  protected readonly lang = toSignal(inject(TranslocoService).langChanges$);
  protected readonly provider = PROVIDER_OPTIONS[0].name;
  protected readonly mono = PROVIDER_OPTIONS[0].mono;
  protected readonly term = termKey(PROVIDER_OPTIONS[0].id);
  protected readonly prTone = prTone;
  protected readonly prStateKey = prStateKey;
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

  private go(prNumber?: number, commitSha?: string): void {
    const repo = this.sel.selectedRepo();
    if (!repo) return;
    void this.router.navigate(repositoryUrl(repo.id, prNumber, commitSha));
  }

  protected openPr(pr: PullRequest): void {
    this.go(pr.number);
  }

  protected openCommit(commit: Commit): void {
    this.go(this.sel.selectedPr()?.number, commit.sha);
  }

  protected closeCommit(): void {
    this.go(this.sel.selectedPr()?.number);
  }

  protected leavePr(): void {
    this.go();
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
