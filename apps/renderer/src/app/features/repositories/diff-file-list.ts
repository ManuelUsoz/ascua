import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { DiffFile } from '@ascua/source-control';
import { Icon } from '../../shared/icon/icon';

/** Column of changed files; a click asks the parent to scroll to that file. */
@Component({
  selector: 'app-diff-file-list',
  imports: [Icon],
  templateUrl: './diff-file-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffFileList {
  readonly files = input.required<DiffFile[]>();
  readonly viewed = input<ReadonlySet<string>>(new Set());
  readonly active = input<number | undefined>(undefined);
  readonly label = input.required<string>();
  readonly fileSelect = output<number>();

  protected readonly rows = computed(() =>
    this.files().map((file, i) => ({
      i,
      file,
      base: file.path.slice(file.path.lastIndexOf('/') + 1),
    })),
  );
}
