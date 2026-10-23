import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SourceControlState } from '../../core/source-control/source-control-state';

/** Connect to GitHub and browse repositories, PRs, commits and CI runs. */
@Component({
  selector: 'app-source-control-page',
  imports: [RouterLink],
  templateUrl: './source-control-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourceControlPage {
  protected readonly state = inject(SourceControlState);

  protected prState(pr: { state: string; draft: boolean }): string {
    return pr.draft ? 'draft' : pr.state;
  }
}
