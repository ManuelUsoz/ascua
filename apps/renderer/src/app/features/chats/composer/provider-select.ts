import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/icon/icon';
import { ProviderIcon, type ProviderBrand } from './provider-icon';

interface ProviderOption {
  readonly id: ProviderBrand;
  /** Transloco key of the provider name. */
  readonly label: string;
  readonly disabled?: boolean;
}

/** Claude is the default: the only provider wired to a run so far. */
const CLAUDE: ProviderOption = { id: 'claude', label: 'chats.provider.claude' };

/** Providers listed in the composer; codex is not available yet. */
const PROVIDERS: readonly ProviderOption[] = [
  CLAUDE,
  { id: 'codex', label: 'chats.provider.codex', disabled: true },
  { id: 'opencode', label: 'chats.provider.opencode' },
];

let nextId = 0;

/**
 * Provider picker shown at the left of the model selector. Picking only
 * updates the value the trigger displays: the run is not wired yet.
 */
@Component({
  selector: 'app-provider-select',
  imports: [TranslocoPipe, Icon, ProviderIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onOutside($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="as-input as-menu__trigger chat-composer__select chat-composer__select--provider"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="'chats.composer.provider.label' | transloco"
      (click)="toggle()"
      (keydown)="onKey($event)"
    >
      <app-provider-icon [brand]="current().id" />
      <span class="chat-composer__provider-name">{{
        current().label | transloco
      }}</span>
      <app-icon class="chat-composer__provider-chevron" name="chevron-down" />
    </button>
    @if (open()) {
      <div
        class="as-menu as-menu--up"
        role="listbox"
        [attr.aria-label]="'chats.composer.provider.label' | transloco"
        [attr.aria-activedescendant]="optionId(active())"
      >
        @for (p of providers; track p.id; let i = $index) {
          <div
            role="option"
            class="as-menu__option"
            [class.as-menu__option--active]="i === active()"
            [class.as-menu__option--selected]="p.id === value()"
            [class.as-menu__option--disabled]="p.disabled === true"
            [id]="optionId(i)"
            [attr.aria-selected]="p.id === value()"
            [attr.aria-disabled]="p.disabled ? 'true' : null"
            tabindex="-1"
            (click)="choose(p)"
            (keydown)="onKey($event)"
            (pointermove)="hover(i, p)"
          >
            <app-provider-icon [brand]="p.id" />
            <span class="as-menu__label">{{ p.label | transloco }}</span>
            @if (p.disabled) {
              <span class="as-menu__hint">{{
                'chats.onboarding.comingSoon' | transloco
              }}</span>
            }
          </div>
        }
      </div>
    }
  `,
})
export class ProviderSelect {
  readonly selected = input<ProviderBrand>('claude');
  readonly picked = output<ProviderBrand>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly uid = `provider-menu-${nextId++}`;

  protected readonly providers = PROVIDERS;
  protected readonly value = linkedSignal<ProviderBrand>(() => this.selected());
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly current = computed(
    () => PROVIDERS.find((p) => p.id === this.value()) ?? CLAUDE,
  );

  protected optionId(i: number): string | null {
    return this.open() ? `${this.uid}-${i}` : null;
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.openMenu();
  }

  protected hover(i: number, provider: ProviderOption): void {
    if (!provider.disabled) this.active.set(i);
  }

  protected choose(provider: ProviderOption): void {
    if (provider.disabled) return;
    this.value.set(provider.id);
    this.picked.emit(provider.id);
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  protected onKey(event: KeyboardEvent): void {
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
        this.active.set(this.step(this.active(), 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(this.step(this.active(), -1));
        break;
      case 'Home':
        event.preventDefault();
        this.active.set(this.edge(1));
        break;
      case 'End':
        event.preventDefault();
        this.active.set(this.edge(-1));
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const provider = PROVIDERS[this.active()];
        if (provider) this.choose(provider);
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

  private openMenu(): void {
    const selected = PROVIDERS.findIndex(
      (p) => p.id === this.value() && !p.disabled,
    );
    this.active.set(selected >= 0 ? selected : this.edge(1));
    this.open.set(true);
  }

  private close(): void {
    this.open.set(false);
  }

  /** Next enabled provider from `from`, wrapping around. */
  private step(from: number, dir: 1 | -1): number {
    const count = PROVIDERS.length;
    let i = from;
    for (let k = 0; k < count; k++) {
      i = (i + dir + count) % count;
      const provider = PROVIDERS[i];
      if (provider && !provider.disabled) return i;
    }
    return from;
  }

  /** First (dir 1) or last (dir -1) enabled provider. */
  private edge(dir: 1 | -1): number {
    return dir === 1 ? this.step(-1, 1) : this.step(0, -1);
  }
}
