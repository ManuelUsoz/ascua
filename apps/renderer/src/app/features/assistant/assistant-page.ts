import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  type OnInit,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorText } from '../../core/i18n/app-error';
import { AssistantStore } from '../../core/assistant/assistant-store';
import type { LoadProgress } from '../../core/voice/ports';
import { VoiceStore } from '../../core/voice/voice-store';
import { Icon } from '../../shared/icon/icon';
import { Spinner } from '../../shared/spinner/spinner';

/** Capability ids of the tool registry; tool names are `<id>_<name>`. */
const CAPABILITIES = [
  'source_control',
  'projects',
  'files',
  'terminals',
  'window',
  'ui',
] as const;
const MAX_LENGTH = 8000;

/** The translation key for a tool chip, by capability. */
export function toolKey(tool: string): string {
  const id = CAPABILITIES.find((c) => tool.startsWith(c + '_'));
  return 'assistant.tool.' + (id ?? 'other');
}

/** Catalog key for a failed message; `unknown` has no catalog entry of its own. */
export function messageErrorKey(kind: string): string {
  return 'errors.assistant.' + (kind === 'unknown' ? 'failed' : kind);
}

/** Asistente: chat with Ascua, backed by the user's own Claude Code. */
@Component({
  selector: 'app-assistant-page',
  imports: [TranslocoPipe, Icon, Spinner],
  templateUrl: './assistant-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantPage implements OnInit {
  protected readonly store = inject(AssistantStore);
  protected readonly voice = inject(VoiceStore);
  protected readonly toolKey = toolKey;
  protected readonly messageErrorKey = messageErrorKey;
  protected readonly maxLength = MAX_LENGTH;
  protected readonly draft = signal('');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly checking = computed(
    () => this.store.status().state === 'checking',
  );
  protected readonly unavailable = computed(() => {
    const status = this.store.status();
    return status.state === 'unavailable' ? status.reason : undefined;
  });
  protected readonly failure = computed(() => {
    const error = this.store.error();
    return error ? errorText(error) : undefined;
  });
  protected readonly voiceFailure = computed(() => {
    const error = this.voice.error();
    return error ? errorText(error) : undefined;
  });
  protected readonly canSend = computed(
    () => this.draft().trim().length > 0 && !this.store.busy(),
  );

  constructor() {
    // Follow the stream: scroll when messages or their text change.
    afterRenderEffect(() => {
      this.store.messages();
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  ngOnInit(): void {
    void this.store.load();
    this.store.warm();
  }

  protected percent(p: LoadProgress): number {
    return p.total > 0
      ? Math.min(100, Math.round((p.loaded / p.total) * 100))
      : 0;
  }

  protected micDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.voice.pressStart();
  }

  protected micLeave(): void {
    // Pointer capture keeps the press alive while held; this only covers a
    // release outside the button when capture is unavailable.
    if (this.voice.state() === 'listening') void this.voice.pressEnd();
  }

  protected input(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void this.send(event.target as HTMLTextAreaElement);
  }

  protected async send(box: HTMLTextAreaElement): Promise<void> {
    const text = this.draft().trim();
    if (!text || this.store.busy()) return;
    this.draft.set('');
    box.value = '';
    await this.store.send(text);
  }
}
