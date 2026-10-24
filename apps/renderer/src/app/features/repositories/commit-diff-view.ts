import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { Commit, CommitDiff } from '@ascua/source-control';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Text } from '../../core/i18n/text';
import { Icon } from '../../shared/icon/icon';
import { Spinner } from '../../shared/spinner/spinner';
import { RelativeTimePipe } from '../../shared/time/relative-time.pipe';
import { DiffFileList } from './diff-file-list';
import { FileDiff } from './file-diff';
import { PROVIDER_OPTIONS } from './providers';

/** The diff of one commit, with the same split layout as the PR files tab. */
@Component({
  selector: 'app-commit-diff-view',
  imports: [
    TranslocoPipe,
    Icon,
    RelativeTimePipe,
    Spinner,
    FileDiff,
    DiffFileList,
  ],
  templateUrl: './commit-diff-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommitDiffView {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly lang = toSignal(inject(TranslocoService).langChanges$);
  protected readonly mono = PROVIDER_OPTIONS[0].mono;

  readonly commit = input.required<Commit>();
  readonly diff = input<CommitDiff | undefined>(undefined);
  readonly loading = input(false);
  readonly error = input<Text | undefined>(undefined);
  readonly back = output<void>();

  protected readonly activeFile = signal<number | undefined>(undefined);

  protected readonly totals = computed(() => {
    const files = this.diff()?.files ?? [];
    return {
      count: files.length,
      add: files.reduce((s, f) => s + f.additions, 0),
      del: files.reduce((s, f) => s + f.deletions, 0),
    };
  });

  protected goTo(i: number): void {
    this.activeFile.set(i);
    const root: HTMLElement = this.host.nativeElement;
    const wrapper = root.querySelector<HTMLElement>('.as-pr__diffs');
    const target = root.querySelector<HTMLElement>(`#commit-file-${i}`);
    if (!wrapper || !target) return;
    wrapper.scrollTop =
      target.getBoundingClientRect().top -
      wrapper.getBoundingClientRect().top +
      wrapper.scrollTop;
  }
}
