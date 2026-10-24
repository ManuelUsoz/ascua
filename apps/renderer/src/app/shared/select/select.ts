import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AsSelect),
      multi: true,
    },
  ],
  template: `
    <select
      class="as-input as-select"
      [attr.aria-label]="ariaLabel()"
      [disabled]="disabled()"
      (change)="pick($event)"
      (blur)="onTouched()"
    >
      @for (o of options(); track o) {
        <option [value]="o" [selected]="o === value()">{{ o }}</option>
      }
    </select>
  `,
})
export class AsSelect implements ControlValueAccessor {
  readonly options = input<string[]>([]);
  readonly ariaLabel = input('');

  protected readonly value = signal<string | null>(null);
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected pick(event: Event): void {
    const next = (event.target as HTMLSelectElement).value;
    this.value.set(next);
    this.onChange(next);
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
    this.disabled.set(isDisabled);
  }
}
