import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon, type IconName } from '../icon/icon';

export interface ContextMenuItem {
  icon: IconName;
  /** Transloco key of the label. */
  label: string;
  run: () => void;
  tone?: 'danger';
}

@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, TranslocoPipe],
  host: {
    '(document:pointerdown)': 'onOutside($event)',
  },
  template: `
    @if (open()) {
      <div
        class="as-menu as-menu--context"
        role="menu"
        [attr.aria-label]="ariaLabel() || null"
        [style.left.px]="x()"
        [style.top.px]="y()"
        tabindex="-1"
      >
        @for (it of items(); track $index; let i = $index) {
          <div
            class="as-menu__option"
            role="menuitem"
            tabindex="-1"
            [class.as-menu__option--danger]="it.tone === 'danger'"
            [class.as-menu__option--active]="i === active()"
            (click)="choose(it)"
            (keydown)="onKey($event)"
            (pointermove)="active.set(i)"
            (blur)="onBlur($event)"
          >
            <app-icon [name]="it.icon" />
            <span class="as-menu__label">{{ it.label | transloco }}</span>
          </div>
        }
      </div>
    }
  `,
})
export class ContextMenu {
  readonly items = input<readonly ContextMenuItem[]>([]);
  readonly ariaLabel = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly x = signal(0);
  protected readonly y = signal(0);

  openAt(x: number, y: number): void {
    if (this.items().length === 0) return;
    this.x.set(x);
    this.y.set(y);
    this.active.set(0);
    this.open.set(true);
    afterNextRender(
      () => {
        const menu = this.menuEl();
        if (!menu) return;
        const r = menu.getBoundingClientRect();
        const maxX = Math.max(0, window.innerWidth - r.width - 4);
        const maxY = Math.max(0, window.innerHeight - r.height - 4);
        this.x.set(Math.min(Math.max(0, x), maxX));
        this.y.set(Math.min(Math.max(0, y), maxY));
        this.focusItem(0);
      },
      { injector: this.injector },
    );
  }

  close(): void {
    this.open.set(false);
  }

  private readonly injector = inject(Injector);

  private menuEl(): HTMLElement | null {
    return this.host.nativeElement.querySelector('[role="menu"]');
  }

  private focusItem(i: number): void {
    this.active.set(i);
    const els =
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        '[role="menuitem"]',
      );
    els[i]?.focus();
  }

  protected choose(it: ContextMenuItem): void {
    this.close();
    it.run();
  }

  protected onBlur(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) this.close();
  }

  protected onKey(event: KeyboardEvent): void {
    const n = this.items().length;
    switch (event.key) {
      case 'Escape':
        event.stopPropagation();
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.focusItem((this.active() + 1) % n);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusItem((this.active() - 1 + n) % n);
        break;
      case 'Home':
        event.preventDefault();
        this.focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusItem(n - 1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const it = this.items()[this.active()];
        if (it) this.choose(it);
        break;
      }
      case 'Tab':
        this.close();
        break;
    }
  }

  protected onOutside(event: Event): void {
    if (
      this.open() &&
      !this.host.nativeElement.contains(event.target as Node)
    ) {
      this.close();
    }
  }
}
