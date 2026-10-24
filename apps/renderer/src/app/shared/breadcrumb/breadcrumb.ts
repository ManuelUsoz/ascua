import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** One place in the path, from general to particular. */
export interface CrumbItem {
  readonly label: string;
  /** Paths, branches and file names. */
  readonly mono?: boolean;
  /** Where the level leads; without it the level is not actionable. */
  readonly go?: () => void;
}

export type CrumbEntry =
  | { readonly kind: 'item'; readonly item: CrumbItem; readonly last: boolean }
  | { readonly kind: 'more' };

const MAX_COLLAPSED = 4;

/** Levels to render: past four, the middle ones fold into a "more" entry. */
export function visibleCrumbs(
  items: readonly CrumbItem[],
  expanded: boolean,
): CrumbEntry[] {
  const entry = (item: CrumbItem, i: number): CrumbEntry => ({
    kind: 'item',
    item,
    last: i === items.length - 1,
  });
  if (expanded || items.length <= MAX_COLLAPSED) return items.map(entry);
  return [
    entry(items[0], 0),
    { kind: 'more' },
    entry(items[items.length - 2], items.length - 2),
    entry(items[items.length - 1], items.length - 1),
  ];
}

@Component({
  selector: 'app-breadcrumb',
  imports: [TranslocoPipe],
  templateUrl: './breadcrumb.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Breadcrumb {
  readonly items = input.required<readonly CrumbItem[]>();
  protected readonly expanded = signal(false);

  protected open(item: CrumbItem): void {
    item.go?.();
  }

  protected entries(): CrumbEntry[] {
    return visibleCrumbs(this.items(), this.expanded());
  }
}
