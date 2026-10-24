import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { Commit } from '@ascua/source-control';
import { TranslocoService } from '@jsverse/transloco';
import { RelativeTimePipe } from '../../shared/time/relative-time.pipe';
import { PROVIDER_OPTIONS } from './providers';

/** One commit line (sha, title, author, age); emits `select` when clicked. */
@Component({
  selector: 'app-commit-row',
  imports: [RelativeTimePipe],
  templateUrl: './commit-row.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommitRow {
  protected readonly lang = toSignal(inject(TranslocoService).langChanges$);
  protected readonly mono = PROVIDER_OPTIONS[0].mono;

  readonly commit = input.required<Commit>();
  readonly chosen = output<Commit>();
}
