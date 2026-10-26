import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AssistantStatus, TranscriptMessage } from '@ascua/assistant';
import type { AscuaError } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
import { AssistantStore } from '../../core/assistant/assistant-store';
import type { LoadProgress, VoiceState } from '../../core/voice/ports';
import { VoiceStore } from '../../core/voice/voice-store';
import { i18nTesting } from '../../testing/i18n';
import { AssistantPage } from './assistant-page';

describe('AssistantPage', () => {
  const status = signal<AssistantStatus>({ state: 'ready' });
  const messages = signal<TranscriptMessage[]>([]);
  const busy = signal(false);
  const error = signal<AscuaError | undefined>(undefined);
  const store = {
    status,
    messages,
    busy,
    error,
    load: vi.fn(() => Promise.resolve()),
    warm: vi.fn(),
    send: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(() => Promise.resolve()),
    reset: vi.fn(() => Promise.resolve()),
    retry: vi.fn(() => Promise.resolve()),
  };

  const vState = signal<VoiceState>('idle');
  const vEnabled = signal(true);
  const vAutoSpeak = signal(true);
  const vError = signal<AscuaError | null>(null);
  const vDownload = signal<LoadProgress | null>(null);
  const voice = {
    state: vState,
    enabled: vEnabled,
    autoSpeak: vAutoSpeak,
    error: vError,
    download: vDownload,
    pressStart: vi.fn(),
    pressEnd: vi.fn(() => Promise.resolve()),
    cancelListening: vi.fn(),
    toggleMute: vi.fn(),
  };

  async function render() {
    TestBed.configureTestingModule({
      imports: [AssistantPage, i18nTesting()],
      providers: [
        { provide: AssistantStore, useValue: store },
        { provide: VoiceStore, useValue: voice },
        provideTranslocoScope('assistant'),
      ],
    });
    const fixture = TestBed.createComponent(AssistantPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    status.set({ state: 'ready' });
    messages.set([]);
    busy.set(false);
    error.set(undefined);
    vState.set('idle');
    vEnabled.set(true);
    vAutoSpeak.set(true);
    vError.set(null);
    vDownload.set(null);
    vi.clearAllMocks();
  });

  it('holds the mic button to talk and shows the voice status', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const mic = el.querySelector('.as-composer__mic') as HTMLButtonElement;
    expect(mic.getAttribute('aria-pressed')).toBe('false');
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerId', { value: 1 });
    mic.dispatchEvent(down);
    expect(voice.pressStart).toHaveBeenCalled();
    mic.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    expect(voice.pressEnd).toHaveBeenCalled();
    vState.set('listening');
    fixture.detectChanges();
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(
      el.querySelector('.as-composer__voice-status')?.textContent,
    ).toContain('Escuchando');
  });

  it('toggles mute and shows a voice error', async () => {
    vError.set({ code: 'voice.noSpeech' });
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('.as-composer__voice-status')?.textContent,
    ).toContain('No se escuchó nada.');
    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Silenciar la voz"]',
    )?.click();
    expect(voice.toggleMute).toHaveBeenCalled();
  });

  it('hides the voice controls when voice is disabled', async () => {
    vEnabled.set(false);
    const el = (await render()).nativeElement as HTMLElement;
    expect(el.querySelector('.as-composer__voice')).toBeNull();
  });

  it('renders the streaming reply with its tool chip', async () => {
    messages.set([
      {
        id: '1',
        role: 'user',
        text: 'qué proyectos tengo',
        tools: [],
        state: 'done',
      },
      {
        id: '2',
        role: 'assistant',
        text: 'Tienes Proyecto demo',
        tools: [{ callId: 'c', tool: 'projects_list', state: 'ok' }],
        state: 'streaming',
      },
    ]);
    const el = (await render()).nativeElement as HTMLElement;
    expect(el.textContent).toContain('qué proyectos tengo');
    expect(el.textContent).toContain('Tienes Proyecto demo');
    expect(el.querySelector('.as-chip')?.textContent).toContain('Proyectos');
  });

  it('sends on Enter and keeps Shift+Enter as a new line', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const box = el.querySelector('textarea') as HTMLTextAreaElement;
    box.value = 'hola';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
        cancelable: true,
      }),
    );
    expect(store.send).not.toHaveBeenCalled();
    box.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
    );
    expect(store.send).toHaveBeenCalledWith('hola');
  });

  it('explains a missing Claude Code and retries', async () => {
    status.set({ state: 'unavailable', reason: 'notInstalled' });
    const el = (await render()).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Falta Claude Code');
    expect(el.querySelector('textarea')).toBeNull();
    el.querySelector<HTMLButtonElement>('button')?.click();
    expect(store.retry).toHaveBeenCalled();
  });

  it('shows cancel while busy', async () => {
    busy.set(true);
    const el = (await render()).nativeElement as HTMLElement;
    expect(el.textContent).toContain('Detener');
    expect(el.textContent).not.toContain('Enviar');
  });
});
