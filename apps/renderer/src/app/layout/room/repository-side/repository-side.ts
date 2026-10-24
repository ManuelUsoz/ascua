import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RepositorySelection } from '../../../core/source-control/repository-selection';
import { SourceControlStore } from '../../../core/source-control/source-control-store';
import { PROVIDER_OPTIONS } from '../../../features/repositories/providers';
import { Button } from '../../../shared/button/button';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';

/**
 * Side slot of Repositorios: the repos list and the account box. Its keys use
 * the `repositories.` scope, loaded by the route that is active meanwhile.
 */
@Component({
  selector: 'app-repository-side',
  imports: [TranslocoPipe, Button, Icon, Spinner],
  templateUrl: './repository-side.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositorySide {
  protected readonly provider = PROVIDER_OPTIONS[0];
  protected readonly store = inject(SourceControlStore);
  protected readonly selection = inject(RepositorySelection);

  protected readonly files = computed(() =>
    (this.selection.diff()?.files ?? []).map((f) => ({
      path: f.path,
      base: f.path.slice(f.path.lastIndexOf('/') + 1),
      additions: f.additions,
      deletions: f.deletions,
    })),
  );

  protected readonly totals = computed(() => ({
    add: this.files().reduce((s, f) => s + f.additions, 0),
    del: this.files().reduce((s, f) => s + f.deletions, 0),
  }));

  protected goTo(i: number): void {
    this.selection.activeFile.set(i);
    document.getElementById(`pr-file-${i}`)?.scrollIntoView();
  }
}
