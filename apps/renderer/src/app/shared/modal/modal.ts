import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../button/button';

@Component({
  selector: 'app-confirm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, TranslocoPipe],
  template: `
    <dialog
      #dlg
      class="as-modal"
      tabindex="-1"
      [attr.aria-label]="title() | transloco"
      (cancel)="onCancel($event)"
      (keydown.escape)="onCancel($event)"
      (click)="onBackdrop($event)"
    >
      <h2 class="as-modal__title">{{ title() | transloco }}</h2>
      <p class="as-modal__body">{{ body() | transloco: bodyParams() }}</p>
      <div class="as-modal__actions">
        <button
          #cancelBtn
          appButton
          variant="quiet"
          (clicked)="cancelled.emit()"
        >
          {{ cancelLabel() | transloco }}
        </button>
        <button
          appButton
          [variant]="tone() === 'danger' ? 'danger' : 'primary'"
          (clicked)="confirmed.emit()"
        >
          {{ confirmLabel() | transloco }}
        </button>
      </div>
    </dialog>
  `,
})
export class ConfirmModal {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly bodyParams = input<Record<string, unknown>>({});
  readonly confirmLabel = input('common.confirm');
  readonly cancelLabel = input('common.cancel');
  readonly tone = input<'danger' | undefined>(undefined);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly dlg =
    viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  private readonly cancelBtn = viewChild.required('cancelBtn', {
    read: ElementRef<HTMLButtonElement>,
  });

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.open()) {
        if (el.open) return;
        if (typeof el.showModal === 'function') el.showModal();
        else el.setAttribute('open', '');
        this.cancelBtn().nativeElement.focus();
      } else if (el.open) {
        if (typeof el.close === 'function') el.close();
        else el.removeAttribute('open');
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.cancelled.emit();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) this.cancelled.emit();
  }
}
