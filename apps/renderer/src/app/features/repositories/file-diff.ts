import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { DiffFile } from '@ascua/source-control';
import { TranslocoPipe } from '@jsverse/transloco';
import { PROVIDER_OPTIONS } from './providers';
import { toSideBySide } from './side-by-side';

/** The diff of one file, side by side; shared by pull requests and commits. */
@Component({
  selector: 'app-file-diff',
  imports: [TranslocoPipe],
  templateUrl: './file-diff.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
})
export class FileDiff {
  protected readonly mono = PROVIDER_OPTIONS[0].mono;

  readonly file = input.required<DiffFile>();
  readonly viewed = input(false);
  readonly viewable = input(false);
  readonly author = input<string | undefined>(undefined);
  readonly toggleViewed = output<void>();

  protected readonly dir = computed(() => {
    const path = this.file().path;
    const cut = path.lastIndexOf('/');
    return cut >= 0 ? path.slice(0, cut + 1) : '';
  });
  protected readonly base = computed(() => {
    const path = this.file().path;
    return path.slice(path.lastIndexOf('/') + 1);
  });
  protected readonly hunks = computed(() => {
    const patch = this.file().patch;
    return patch ? toSideBySide(patch) : undefined;
  });
}
