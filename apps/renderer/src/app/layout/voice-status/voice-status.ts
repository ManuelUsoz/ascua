import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssistantStore } from '../../core/assistant/assistant-store';
import { errorText } from '../../core/i18n/app-error';
import type { LoadProgress } from '../../core/voice/ports';
import { VoiceStore } from '../../core/voice/voice-store';

/**
 * Non-interactive voice feedback that lives outside Asistente and Ajustes:
 * model download, listening/speaking state and voice or assistant errors. It
 * is plain text on purpose: the compact window is click-through, so nothing
 * here may need a click.
 */
@Component({
  selector: 'app-voice-status',
  imports: [TranslocoPipe],
  templateUrl: './voice-status.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceStatus {
  protected readonly voice = inject(VoiceStore);
  private readonly assistant = inject(AssistantStore);

  protected readonly failure = computed(() => {
    const error = this.voice.error() ?? this.assistant.error();
    return error ? errorText(error) : undefined;
  });
  protected readonly visible = computed(
    () =>
      !!this.failure() ||
      !!this.voice.download() ||
      this.voice.state() !== 'idle',
  );

  protected percent(p: LoadProgress): number {
    return p.total > 0 ? Math.round((p.loaded / p.total) * 100) : 0;
  }
}
