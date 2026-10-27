import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AscuaError } from '@ascua/ipc';
import { AssistantStore } from '../../core/assistant/assistant-store';
import type { LoadProgress, VoiceState } from '../../core/voice/ports';
import { VoiceStore } from '../../core/voice/voice-store';
import { i18nTesting } from '../../testing/i18n';
import { VoiceStatus } from './voice-status';

describe('VoiceStatus', () => {
  const state = signal<VoiceState>('idle');
  const download = signal<LoadProgress | null>(null);
  const voiceError = signal<AscuaError | null>(null);
  const assistantError = signal<AscuaError | null>(null);

  function render() {
    TestBed.configureTestingModule({
      imports: [VoiceStatus, i18nTesting()],
      providers: [
        {
          provide: VoiceStore,
          useValue: { state, download, error: voiceError },
        },
        { provide: AssistantStore, useValue: { error: assistantError } },
      ],
    });
    const fixture = TestBed.createComponent(VoiceStatus);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(
      '#voice-status',
    ) as HTMLElement;
    return { fixture, el };
  }

  beforeEach(() => {
    state.set('idle');
    download.set(null);
    voiceError.set(null);
    assistantError.set(null);
  });

  it('is hidden when idle', () => {
    expect(render().el.hidden).toBe(true);
  });

  it('shows the state, the download and the errors', () => {
    const { fixture, el } = render();
    state.set('listening');
    fixture.detectChanges();
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain('Escuchando');

    download.set({ engine: 'stt', loaded: 50, total: 100 });
    fixture.detectChanges();
    expect(el.textContent).toContain('50%');

    assistantError.set({ code: 'assistant.failed' });
    fixture.detectChanges();
    expect(el.textContent).toContain('El asistente no pudo responder.');

    voiceError.set({ code: 'voice.noSpeech' });
    fixture.detectChanges();
    expect(el.textContent).toContain('No se escuchó nada.');
  });
});
