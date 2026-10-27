import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorText } from '../../core/i18n/app-error';
import type { Text } from '../../core/i18n/text';
import {
  MethodologyStore,
  type MethodologyResult,
} from '../../core/projects/methodology-store';
import { Button } from '../../shared/button/button';
import { Spinner } from '../../shared/spinner/spinner';

/** Edits the methodology rules injected into the project's chats. */
@Component({
  selector: 'app-project-methodology-page',
  imports: [RouterLink, TranslocoPipe, Button, Spinner],
  templateUrl: './project-methodology-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectMethodologyPage {
  private readonly store = inject(MethodologyStore);

  readonly projectId = input.required<string>();

  protected readonly rules = signal('');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<Text | undefined>(undefined);

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.apply(await this.store.load(id));
    this.loading.set(false);
  }

  protected onInput(event: Event): void {
    this.rules.set((event.target as HTMLTextAreaElement).value);
    this.saved.set(false);
  }

  protected save(): Promise<void> {
    return this.act(() => this.store.save(this.projectId(), this.rules()));
  }

  protected reset(): Promise<void> {
    return this.act(() => this.store.reset(this.projectId()));
  }

  private async act(call: () => Promise<MethodologyResult>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    const ok = this.apply(await call());
    this.saved.set(ok);
    this.busy.set(false);
  }

  private apply(result: MethodologyResult): boolean {
    if (result.ok) {
      this.rules.set(result.rules);
      this.error.set(undefined);
      return true;
    }
    this.error.set(errorText(result.error));
    return false;
  }
}
