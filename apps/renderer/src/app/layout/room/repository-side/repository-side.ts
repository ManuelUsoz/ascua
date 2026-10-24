import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RepositorySelection } from '../../../core/source-control/repository-selection';
import { SourceControlStore } from '../../../core/source-control/source-control-store';
import { PROVIDER_OPTIONS } from '../../../features/repositories/providers';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';

/**
 * Side slot of Repositorios: always the repos list (also with a PR open) and
 * the account box. Its keys use
 * the `repositories.` scope, loaded by the route that is active meanwhile.
 */
@Component({
  selector: 'app-repository-side',
  imports: [TranslocoPipe, Icon, Spinner],
  templateUrl: './repository-side.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositorySide {
  protected readonly provider = PROVIDER_OPTIONS[0];
  protected readonly store = inject(SourceControlStore);
  protected readonly selection = inject(RepositorySelection);
}
