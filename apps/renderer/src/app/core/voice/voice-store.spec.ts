import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AssistantEvent } from '@ascua/assistant';
import { ASCUA_API } from '../bridge/ascua-api';
import { Companion } from '../companion/companion';
import { AssistantContext } from '../assistant/assistant-context';
import { AssistantStore } from '../assistant/assistant-store';
import { PermissionQueue } from '../permissions/permission-queue';
import { ProjectStore } from '../projects/project-store';
import { SettingsStore } from '../settings/settings-store';
import type { SpeakOptions } from './ports';
import {
  AUDIO_CAPTURE,
  SPEECH_RECOGNIZER,
  SPEECH_SYNTHESIZER,
} from './voice-engines';
import { VoiceStore } from './voice-store';

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('VoiceStore', () => {
  let emit: (event: AssistantEvent) => void;
  let voiceSettings: ReturnType<typeof signal<Record<string, unknown>>>;
  let language: ReturnType<typeof signal<string>>;
  let busy: ReturnType<typeof signal<boolean>>;
  let pending: { source: string } | undefined;
  let decide: ReturnType<typeof vi.fn>;
  let assistant: {
    warm: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  let setVoice: ReturnType<typeof vi.fn>;
  let voiceCalls: unknown[];
  let activeCalls: boolean[];
  let capture: Record<string, ReturnType<typeof vi.fn>>;
  let loadRecognizer: () => Promise<void>;
  let transcript: string;
  let recognizer: Record<string, ReturnType<typeof vi.fn>>;
  let rendered: { sentence: string; options: SpeakOptions }[];
  let failRender: boolean;
  let synth: Record<string, ReturnType<typeof vi.fn>>;
  let store: VoiceStore;

  beforeEach(() => {
    vi.useFakeTimers();
    voiceSettings = signal({ enabled: true, autoSpeak: true, style: 'F1' });
    language = signal('es');
    busy = signal(false);
    voiceCalls = [];
    activeCalls = [];
    rendered = [];
    failRender = false;
    transcript = 'ya terminé por hoy';
    loadRecognizer = () => Promise.resolve();
    setVoice = vi.fn(async () => undefined);
    pending = undefined;
    decide = vi.fn();
    assistant = {
      warm: vi.fn(),
      send: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
    };
    capture = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => new Float32Array(8000)),
      cancel: vi.fn(),
    };
    recognizer = {
      load: vi.fn(() => loadRecognizer()),
      transcribe: vi.fn(async () => transcript),
      dispose: vi.fn(),
    };
    synth = {
      load: vi.fn(async () => undefined),
      render: vi.fn(async (sentence: string, options: SpeakOptions) => {
        if (failRender) throw new Error('boom');
        rendered.push({ sentence, options });
        return { play: () => Promise.resolve() };
      }),
      stop: vi.fn(),
      dispose: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ASCUA_API,
          useValue: {
            setVoiceActive: vi.fn(
              async (a: boolean) => void activeCalls.push(a),
            ),
          },
        },
        {
          provide: SettingsStore,
          useValue: { voice: voiceSettings, language, setVoice },
        },
        {
          provide: AssistantStore,
          useValue: {
            busy,
            send: assistant.send,
            cancel: assistant.cancel,
            warm: assistant.warm,
            events: (l: (e: AssistantEvent) => void) => {
              emit = l;
              return () => undefined;
            },
          },
        },
        {
          provide: Companion,
          useValue: { voice: (s: unknown) => voiceCalls.push(s) },
        },
        {
          provide: ProjectStore,
          useValue: {
            projects: () => [
              {
                id: 'p',
                name: 'Mi API',
                path: '/p',
                terminals: [{ id: 't', name: 'web', command: 'x' }],
              },
            ],
          },
        },
        {
          provide: AssistantContext,
          useValue: { uiLabels: () => ({ 'nav.terminals': 'Terminal' }) },
        },
        {
          provide: PermissionQueue,
          useValue: { current: () => pending, decide },
        },
        { provide: AUDIO_CAPTURE, useValue: capture },
        { provide: SPEECH_RECOGNIZER, useValue: recognizer },
        { provide: SPEECH_SYNTHESIZER, useValue: synth },
      ],
    });
    store = TestBed.inject(VoiceStore);
    store.start();
  });

  afterEach(() => vi.useRealTimers());

  async function hold(ms: number): Promise<void> {
    store.pressStart();
    await flush();
    vi.advanceTimersByTime(ms);
    await store.pressEnd();
    await flush();
  }

  it('listens, transcribes and sends like typed text', async () => {
    store.pressStart();
    expect(store.state()).toBe('listening');
    expect(document.body.dataset['voice']).toBe('listening');
    await flush();
    vi.advanceTimersByTime(600);
    await store.pressEnd();
    expect(assistant.send).toHaveBeenCalledWith('ya terminé por hoy');
    expect(store.state()).toBe('idle');
    expect(voiceCalls).toEqual(['listening', null, null, null]);
    expect(activeCalls).toEqual([true, false]);
  });

  it('shows loadingModel while the model is slow, then transcribing', async () => {
    let release!: () => void;
    loadRecognizer = () => new Promise<void>((r) => (release = r));
    store.pressStart();
    await flush();
    vi.advanceTimersByTime(600);
    const ending = store.pressEnd();
    await flush();
    expect(store.state()).toBe('loadingModel');
    release();
    await ending;
    expect(recognizer['transcribe']).toHaveBeenCalled();
    expect(assistant.send).toHaveBeenCalled();
  });

  it('drops the voice-active flag once the pointer is up, before the model loads', async () => {
    loadRecognizer = () => new Promise<void>(() => undefined);
    store.pressStart();
    await flush();
    vi.advanceTimersByTime(600);
    void store.pressEnd();
    await flush();
    expect(store.state()).toBe('loadingModel');
    expect(activeCalls).toEqual([true, false]);
  });

  it('closes the mic when cancelled before getUserMedia resolves', async () => {
    let grant!: () => void;
    capture['start'].mockImplementationOnce(
      () => new Promise<void>((r) => (grant = r)),
    );
    store.pressStart();
    store.cancelListening();
    capture['cancel'].mockClear();
    grant();
    await flush();
    expect(capture['cancel']).toHaveBeenCalled();
  });

  it('does not speak the reply while the user is holding to talk', async () => {
    emit({ type: 'turnStarted', turn: 't', text: 'hola' });
    store.pressStart();
    await flush();
    emit({ type: 'text', turn: 't', delta: 'Listo. Nos vemos. ' });
    await flush();
    expect(rendered).toEqual([]);
  });

  it('ignores a short press', async () => {
    await hold(100);
    expect(capture['cancel']).toHaveBeenCalled();
    expect(recognizer['transcribe']).not.toHaveBeenCalled();
    expect(store.state()).toBe('idle');
  });

  it('reports no speech', async () => {
    transcript = '  ';
    await hold(600);
    expect(store.error()?.code).toBe('voice.noSpeech');
    expect(assistant.send).not.toHaveBeenCalled();
    expect(store.state()).toBe('idle');
  });

  it('does nothing when disabled', () => {
    voiceSettings.set({ enabled: false, autoSpeak: true, style: 'F1' });
    store.pressStart();
    expect(store.state()).toBe('idle');
    expect(capture['start']).not.toHaveBeenCalled();
    expect(assistant.warm).not.toHaveBeenCalled();
  });

  it('warms the assistant on press when voice is enabled', () => {
    store.pressStart();
    expect(assistant.warm).toHaveBeenCalledTimes(1);
  });

  it('passes the vocabulary as the transcription prompt', async () => {
    await hold(600);
    const prompt = recognizer['transcribe'].mock.calls[0][3] as string;
    expect(prompt).toContain('Ascua');
    expect(prompt).toContain('Mi API');
    expect(prompt).toContain('web');
    expect(prompt).toContain('Terminal');
  });

  it('answers a pending assistant confirmation by voice', async () => {
    pending = { source: 'assistant' };
    transcript = 'Dale';
    await hold(600);
    expect(decide).toHaveBeenCalledWith('allow');
    expect(assistant.send).not.toHaveBeenCalled();
    expect(assistant.cancel).not.toHaveBeenCalled();
    expect(store.state()).toBe('idle');
  });

  it('asks for sí or no when the answer is unclear', async () => {
    pending = { source: 'assistant' };
    transcript = 'qué hora es en Madrid ahora mismo';
    await hold(600);
    expect(store.error()?.code).toBe('voice.answerYesNo');
    expect(decide).not.toHaveBeenCalled();
    expect(assistant.send).not.toHaveBeenCalled();
  });

  it('does not treat a hook request as a spoken answer', async () => {
    pending = { source: 'hook' };
    await hold(600);
    expect(decide).not.toHaveBeenCalled();
    expect(assistant.send).toHaveBeenCalledWith('ya terminé por hoy');
  });

  it('cancels a busy turn and stops speech before sending', async () => {
    busy.set(true);
    await hold(600);
    expect(synth['stop']).toHaveBeenCalled();
    expect(assistant.cancel).toHaveBeenCalled();
    expect(assistant.send).toHaveBeenCalled();
  });

  it('maps a mic failure', async () => {
    capture['start'].mockRejectedValueOnce(
      new Error(JSON.stringify({ code: 'voice.micDenied' })),
    );
    store.pressStart();
    await flush();
    expect(store.state()).toBe('idle');
    expect(store.error()).toBeTruthy();
  });

  it('speaks streamed text in order with language and style', async () => {
    emit({ type: 'turnStarted', turn: 't', text: 'hola' });
    emit({ type: 'text', turn: 't', delta: 'Listo. Nos ' });
    emit({ type: 'text', turn: 't', delta: 'vemos.' });
    emit({ type: 'turnDone', turn: 't', outcome: 'done' });
    await flush();
    expect(rendered.map((r) => r.sentence)).toEqual(['Listo.', 'Nos vemos.']);
    expect(rendered[0].options).toEqual({ language: 'es', style: 'F1' });
  });

  it('does not speak when muted, and stops on cancel', async () => {
    voiceSettings.set({ enabled: true, autoSpeak: false, style: 'F1' });
    emit({ type: 'turnStarted', turn: 't', text: 'hola' });
    emit({ type: 'text', turn: 't', delta: 'Listo. ' });
    await flush();
    expect(rendered).toEqual([]);
    emit({ type: 'turnDone', turn: 't', outcome: 'cancelled' });
    expect(synth['stop']).toHaveBeenCalled();
  });

  it('toggleMute persists autoSpeak and stops speech when muting', () => {
    store.toggleMute();
    expect(synth['stop']).toHaveBeenCalled();
    expect(setVoice).toHaveBeenCalledWith({ autoSpeak: false });
  });

  it('turns a render failure into voice.ttsUnavailable', async () => {
    failRender = true;
    emit({ type: 'turnStarted', turn: 't', text: 'hola' });
    emit({ type: 'text', turn: 't', delta: 'Listo. ' });
    await flush();
    expect(store.error()?.code).toBe('voice.ttsUnavailable');
  });

  it('previews with autoSpeak off', async () => {
    voiceSettings.set({ enabled: true, autoSpeak: false, style: 'M2' });
    store.preview('Hola');
    await flush();
    expect(rendered).toEqual([
      { sentence: 'Hola', options: { language: 'es', style: 'M2' } },
    ]);
  });
});
