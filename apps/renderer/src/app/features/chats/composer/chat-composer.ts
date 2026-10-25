import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/button/button';

/** Prompt box: Enter sends, Shift+Enter adds a line, Escape stops at the host. */
@Component({
  selector: 'app-chat-composer',
  imports: [TranslocoPipe, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-composer' },
  template: `
    <textarea
      class="as-input chat-composer__input"
      rows="2"
      [value]="draft()"
      [disabled]="disabled()"
      [attr.aria-label]="'chats.composer.label' | transloco"
      [placeholder]="'chats.composer.placeholder' | transloco"
      (input)="onInput($event)"
      (keydown)="onKey($event)"
    ></textarea>
    <div class="chat-composer__actions">
      @if (running()) {
        <button
          appButton
          type="button"
          variant="danger"
          size="s"
          (clicked)="aborted.emit()"
        >
          {{ 'chats.composer.stop' | transloco }}
        </button>
      }
    </div>
  `,
})
export class ChatComposer {
  readonly disabled = input(false);
  readonly running = input(false);
  readonly submitted = output<string>();
  readonly aborted = output<void>();

  protected readonly draft = signal('');
  protected readonly canSend = computed(
    () => !this.disabled() && !this.running() && this.draft().trim() !== '',
  );

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.running()) this.aborted.emit();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(): void {
    if (!this.canSend()) return;
    const value = this.draft().trim();
    this.draft.set('');
    this.submitted.emit(value);
  }
}
