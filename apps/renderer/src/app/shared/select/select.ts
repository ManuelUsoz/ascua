import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon, type IconName } from '../icon/icon';

export interface SelectOption {
  value: string;
  /** Transloco key of the label. */
  label: string;
  /** Transloco key of the one-line description. */
  hint?: string;
  icon?: IconName;
}

let nextId = 0;

@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, TranslocoPipe],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AsSelect),
      multi: true,
    },
  ],
  host: {
    '(document:pointerdown)': 'onOutside($event)',
  },
  template: `
    @if (rich()) {
      <button
        #trigger
        type="button"
        class="as-input as-select as-menu__trigger {{ triggerClass() }}"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="ariaLabel() || null"
        [disabled]="isOff()"
        (click)="toggle()"
        (keydown)="onKey($event)"
        (blur)="onTouched()"
      >
        @if (current(); as c) {
          @if (c.icon) {
            <app-icon [name]="c.icon" />
          }
          <span>{{ c.label | transloco }}</span>
        }
      </button>
      @if (open()) {
        <div
          class="as-menu"
          role="listbox"
          [class.as-menu--up]="placement() === 'up'"
          [attr.aria-label]="ariaLabel() || null"
          [attr.aria-activedescendant]="optionId(active())"
        >
          @for (o of items(); track o.value; let i = $index) {
            <div
              class="as-menu__option"
              role="option"
              [id]="optionId(i)"
              [class.as-menu__option--active]="i === active()"
              [class.as-menu__option--selected]="o.value === value()"
              [attr.aria-selected]="o.value === value()"
              tabindex="-1"
              (click)="choose(o)"
              (keydown)="onKey($event)"
              (pointermove)="active.set(i)"
            >
              @if (o.icon) {
                <app-icon [name]="o.icon" />
              }
              <span class="as-menu__label">{{ o.label | transloco }}</span>
              @if (o.hint) {
                <span class="as-menu__hint">{{ o.hint | transloco }}</span>
              }
            </div>
          }
        </div>
      }
    } @else {
      <select
        class="as-input as-select {{ triggerClass() }}"
        [attr.aria-label]="ariaLabel()"
        [disabled]="isOff()"
        (change)="pick($event)"
        (blur)="onTouched()"
      >
        @for (o of items(); track o.value) {
          <option [value]="o.value" [selected]="o.value === value()">
            {{ o.label }}
          </option>
        }
      </select>
    }
  `,
})
export class AsSelect implements ControlValueAccessor {
  readonly options = input<readonly (string | SelectOption)[]>([]);
  readonly ariaLabel = input('');
  readonly selected = input<string | null | undefined>(undefined);
  readonly placement = input<'down' | 'up'>('down');
  readonly isDisabled = input(false);
  readonly triggerClass = input('');
  readonly picked = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly uid = `as-menu-${nextId++}`;

  protected readonly value = linkedSignal<string | null>(() => {
    const s = this.selected();
    return s === undefined ? null : s;
  });
  private readonly formDisabled = signal(false);
  protected readonly isOff = computed(
    () => this.isDisabled() || this.formDisabled(),
  );
  protected readonly open = signal(false);
  protected readonly active = signal(0);

  protected readonly items = computed<SelectOption[]>(() =>
    this.options().map((o) =>
      typeof o === 'string' ? { value: o, label: o } : o,
    ),
  );
  protected readonly rich = computed(() =>
    this.options().some((o) => typeof o !== 'string' && (o.hint || o.icon)),
  );
  protected readonly current = computed(
    () => this.items().find((o) => o.value === this.value()) ?? null,
  );

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected optionId(i: number): string | null {
    return this.open() ? `${this.uid}-${i}` : null;
  }

  protected pick(event: Event): void {
    this.commit((event.target as HTMLSelectElement).value);
  }

  private commit(next: string): void {
    this.value.set(next);
    this.onChange(next);
    this.picked.emit(next);
  }

  protected choose(o: SelectOption): void {
    this.commit(o.value);
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.openMenu();
  }

  private openMenu(): void {
    if (this.isOff()) return;
    const i = this.items().findIndex((o) => o.value === this.value());
    this.active.set(Math.max(i, 0));
    this.open.set(true);
  }

  private close(): void {
    this.open.set(false);
  }

  protected onKey(event: KeyboardEvent): void {
    if (this.isOff()) return;
    const n = this.items().length;
    if (!this.open()) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        this.openMenu();
      }
      return;
    }
    switch (event.key) {
      case 'Escape':
        event.stopPropagation();
        event.preventDefault();
        this.close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        this.active.set((this.active() + 1) % n);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set((this.active() - 1 + n) % n);
        break;
      case 'Home':
        event.preventDefault();
        this.active.set(0);
        break;
      case 'End':
        event.preventDefault();
        this.active.set(n - 1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const o = this.items()[this.active()];
        if (o) this.choose(o);
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

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
    if (isDisabled) this.close();
  }
}
