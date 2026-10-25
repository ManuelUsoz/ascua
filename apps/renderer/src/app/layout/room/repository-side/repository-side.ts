import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Repository } from '@ascua/source-control';
import { RepositorySelection } from '../../../core/source-control/repository-selection';
import { SourceControlStore } from '../../../core/source-control/source-control-store';
import { PROVIDER_OPTIONS } from '../../../features/repositories/providers';
import { repositoryUrl } from '../../../features/repositories/repository-path';
import { Button } from '../../../shared/button/button';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';

/**
 * Side slot of Repositorios: always the repos list (also with a PR open) and
 * the account box. Its keys use
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
  private readonly router = inject(Router);

  protected openRepo(repo: Repository): void {
    void this.router.navigate(repositoryUrl(repo.id));
  }
}
