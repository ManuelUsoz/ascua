import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import type {
  PullRequest,
  PullRequestDiff,
  Repository,
  ReviewEvent,
} from '@ascua/source-control';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorText, toAscuaError } from '../../core/i18n/app-error';
import type { Text } from '../../core/i18n/text';
import { SourceControlStore } from '../../core/source-control/source-control-store';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { Spinner } from '../../shared/spinner/spinner';
import { RelativeTimePipe } from '../../shared/time/relative-time.pipe';
import { toSideBySide } from './side-by-side';
import { PROVIDER_OPTIONS } from './providers';

/** One pull request: header, review actions and a side-by-side diff. */
@Component({
  selector: 'app-pull-request-view',
  imports: [
    TranslocoPipe,
    FormsModule,
    Icon,
    RelativeTimePipe,
    Spinner,
    Button,
  ],
  templateUrl: './pull-request-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PullRequestView {
  private readonly store = inject(SourceControlStore);
  protected readonly lang = toSignal(inject(TranslocoService).langChanges$);
  protected readonly mono = PROVIDER_OPTIONS[0].mono;

  readonly repo = input.required<Repository>();
  readonly pr = input.required<PullRequest>();
  readonly diff = input<PullRequestDiff | undefined>(undefined);
  readonly diffLoading = input(false);
  readonly diffError = input<Text | undefined>(undefined);
  readonly account = input<{ login: string } | undefined>(undefined);
  readonly back = output<void>();

  protected readonly composing = signal<ReviewEvent | undefined>(undefined);
  protected readonly comment = signal('');
  protected readonly submitting = signal(false);
  protected readonly done = signal<ReviewEvent | undefined>(undefined);
  protected readonly error = signal<Text | undefined>(undefined);

  protected readonly own = computed(() => {
    const login = this.account()?.login;
    return !!login && login === this.pr().author.login;
  });

  protected readonly files = computed(() =>
    (this.diff()?.files ?? []).map((file, i) => {
      const cut = file.path.lastIndexOf('/');
      return {
        i,
        file,
        dir: cut >= 0 ? file.path.slice(0, cut + 1) : '',
        base: cut >= 0 ? file.path.slice(cut + 1) : file.path,
        hunks: file.patch ? toSideBySide(file.patch) : undefined,
      };
    }),
  );

  protected readonly totals = computed(() => {
    const files = this.diff()?.files ?? [];
    return {
      count: files.length,
      add: files.reduce((s, f) => s + f.additions, 0),
      del: files.reduce((s, f) => s + f.deletions, 0),
    };
  });

  protected compose(event: ReviewEvent): void {
    this.error.set(undefined);
    this.done.set(undefined);
    this.comment.set('');
    this.composing.set(event);
  }

  protected cancel(): void {
    this.composing.set(undefined);
  }

  protected async submit(event: ReviewEvent): Promise<void> {
    // Approve never takes the composer draft: that belongs to the event being composed
    const body = event === 'approve' ? '' : this.comment().trim();
    if (event !== 'approve' && !body) return;
    this.submitting.set(true);
    this.error.set(undefined);
    this.done.set(undefined);
    try {
      await this.store.review(this.repo().id, this.pr().number, {
        event,
        ...(body ? { body } : {}),
      });
      this.done.set(event);
      if (event !== 'approve') {
        this.composing.set(undefined);
        this.comment.set('');
      }
    } catch (e) {
      this.error.set(errorText(toAscuaError(e)));
    } finally {
      this.submitting.set(false);
    }
  }
}
