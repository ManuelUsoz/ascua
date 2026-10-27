import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { BenchmarkStore } from '../../../core/projects/benchmark-store';
import { ProjectStore } from '../../../core/projects/project-store';
import { errorText } from '../../../core/i18n/app-error';
import { Button } from '../../../shared/button/button';
import { CollapsibleCard } from '../../../shared/collapsible-card/collapsible-card';
import { Notice } from '../../../shared/notice/notice';
import { ProgressBar } from '../../../shared/progress/progress-bar';
import { AsSelect, type SelectOption } from '../../../shared/select/select';

/** Settings "Ascua harness": runs the retrieval benchmark on a project index. */
@Component({
  selector: 'app-harness-panel',
  imports: [
    TranslocoPipe,
    Button,
    CollapsibleCard,
    Notice,
    ProgressBar,
    AsSelect,
  ],
  templateUrl: './harness-panel.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HarnessPanel {
  protected readonly bench = inject(BenchmarkStore);
  private readonly projects = inject(ProjectStore);
  private readonly picked = signal<string | undefined>(undefined);

  protected readonly options = computed<SelectOption[]>(() =>
    this.projects.projects().map((p) => ({ value: p.id, label: p.name })),
  );
  protected readonly projectId = computed(
    () => this.picked() ?? this.options()[0]?.value,
  );
  protected readonly failure = computed(() => {
    const e = this.bench.error();
    return e ? errorText(e) : undefined;
  });

  protected pick(id: string): void {
    this.picked.set(id);
  }

  protected run(): void {
    const id = this.projectId();
    if (id) void this.bench.run(id);
  }

  protected percent(rate: number): number {
    return Math.round(rate * 100);
  }
}
