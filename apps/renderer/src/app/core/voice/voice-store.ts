import { computed, inject, Injectable, isDevMode, signal } from '@angular/core';
import type { AssistantEvent } from '@ascua/assistant';
import { encodeError, type AscuaError } from '@ascua/ipc';
import { ASCUA_API } from '../bridge/ascua-api';
import { Companion } from '../companion/companion';
import { toAscuaError } from '../i18n/app-error';
import { AssistantContext } from '../assistant/assistant-context';
import { AssistantStore } from '../assistant/assistant-store';
import { PermissionQueue } from '../permissions/permission-queue';
import { ProjectStore } from '../projects/project-store';
import { SettingsStore } from '../settings/settings-store';
import { TurnTiming } from './turn-timing';
import { voiceVocabulary } from './vocabulary';
import { answerFor } from './yes-no';
import { deleteModelCache } from './runtime/model-cache';
import { SentenceChunker } from './sentence-chunker';
import { SpeechQueue } from './speech-queue';
import type { LoadProgress, VoiceState } from './ports';
import {
  AUDIO_CAPTURE,
  SPEECH_RECOGNIZER,
  SPEECH_SYNTHESIZER,
} from './voice-engines';

/** A press shorter than this is a mis-click, not speech. */
const MIN_PRESS_MS = 300;

/** Push-to-talk, transcription and spoken replies. */
@Injectable({ providedIn: 'root' })
export class VoiceStore {
  private readonly api = inject(ASCUA_API);
  private readonly settings = inject(SettingsStore);
  private readonly assistant = inject(AssistantStore);
  private readonly companion = inject(Companion);
  private readonly projects = inject(ProjectStore);
  private readonly assistantContext = inject(AssistantContext);
  private readonly permissions = inject(PermissionQueue);
  private readonly capture = inject(AUDIO_CAPTURE);
  private readonly recognizer = inject(SPEECH_RECOGNIZER);
  private readonly synth = inject(SPEECH_SYNTHESIZER);
  private readonly current = signal<VoiceState>('idle');
  private readonly progress = signal<LoadProgress | null>(null);
  private readonly failure = signal<AscuaError | null>(null);
  private readonly queue = new SpeechQueue(
    this.synth,
    (speaking) => {
      if (speaking) this.reportTiming();
      if (speaking && this.current() === 'idle') this.setState('speaking');
      else if (!speaking && this.current() === 'speaking')
        this.setState('idle');
    },
    () => this.failure.set({ code: 'voice.ttsUnavailable' }),
  );
  private chunker = new SentenceChunker();
  private started = false;
  private active = false;
  private pressedAt = 0;
  private timing?: TurnTiming;
  private starting?: Promise<boolean>;
  private abort?: AbortController;

  readonly state = this.current.asReadonly();
  readonly download = this.progress.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly enabled = computed(() => this.settings.voice().enabled);
  readonly autoSpeak = computed(() => this.settings.voice().autoSpeak);
  readonly style = computed(() => this.settings.voice().style);

  /** Follows assistant events to speak replies. Safe to call more than once. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.assistant.events((event) => this.onAssistantEvent(event));
  }

  pressStart(): void {
    if (!this.enabled() || this.current() === 'listening') return;
    this.abort?.abort();
    this.queue.stop();
    this.failure.set(null);
    this.pressedAt = Date.now();
    this.timing = undefined;
    // Spawn the model process while the user is still talking.
    this.assistant.warm();
    this.setState('listening');
    void this.recognizer
      .load((p) => this.progress.set(p))
      .catch(() => undefined);
    this.starting = this.capture.start().then(
      () => true,
      (e) => {
        this.fail(e);
        return false;
      },
    );
  }

  async pressEnd(): Promise<void> {
    if (this.current() !== 'listening') return;
    const started = (await this.starting) ?? false;
    if (!started || this.current() !== 'listening') return;
    if (Date.now() - this.pressedAt < MIN_PRESS_MS) {
      this.capture.cancel();
      this.setState('idle');
      return;
    }
    const abort = new AbortController();
    this.abort = abort;
    const timing = new TurnTiming();
    timing.mark('released');
    try {
      const audio = await this.capture.stop();
      this.setState('loadingModel');
      await this.recognizer.load((p) => this.progress.set(p));
      this.progress.set(null);
      if (abort.signal.aborted) return;
      this.setState('transcribing');
      const text = (
        await this.recognizer.transcribe(
          audio,
          this.settings.language(),
          abort.signal,
          voiceVocabulary(
            this.projects.projects(),
            this.assistantContext.uiLabels(),
          ),
        )
      ).trim();
      if (abort.signal.aborted) return;
      if (!text) throw new Error(encodeError({ code: 'voice.noSpeech' }));
      // A pending assistant confirmation takes the next utterance as its answer.
      if (this.permissions.current()?.source === 'assistant') {
        const answer = answerFor(text, this.settings.language());
        if (!answer)
          throw new Error(encodeError({ code: 'voice.answerYesNo' }));
        this.setState('idle');
        this.permissions.decide(answer);
        return;
      }
      timing.mark('transcribed');
      this.setState('idle');
      if (this.assistant.busy()) await this.assistant.cancel();
      timing.mark('sent');
      this.timing = timing;
      await this.assistant.send(text);
    } catch (e) {
      if (!abort.signal.aborted) this.fail(e);
    }
  }

  cancelListening(): void {
    if (this.current() === 'idle' || this.current() === 'speaking') return;
    this.abort?.abort();
    this.capture.cancel();
    // getUserMedia may still be pending: close the mic once it resolves.
    void this.starting?.then(() => {
      if (this.current() !== 'listening') this.capture.cancel();
    });
    this.progress.set(null);
    this.setState('idle');
  }

  toggleMute(): void {
    const next = !this.autoSpeak();
    if (!next) this.queue.stop();
    void this.settings.setVoice({ autoSpeak: next });
  }

  /** Loads both engines (Ajustes "Preparar voz"). */
  async prepare(): Promise<void> {
    this.failure.set(null);
    const onProgress = (p: LoadProgress) => this.progress.set(p);
    try {
      await Promise.all([
        this.recognizer.load(onProgress),
        this.synth.load(onProgress),
      ]);
    } catch (e) {
      this.fail(e);
    } finally {
      this.progress.set(null);
    }
  }

  /** Speaks one sentence with the current style, even when muted. */
  preview(text: string): void {
    this.failure.set(null);
    this.queue.stop();
    this.queue.newTurn();
    this.queue.push(text, {
      language: this.settings.language(),
      style: this.style(),
    });
  }

  async clearModels(): Promise<void> {
    this.queue.stop();
    this.recognizer.dispose();
    this.synth.dispose();
    try {
      await deleteModelCache();
    } catch (e) {
      this.fail(e);
    }
  }

  private onAssistantEvent(event: AssistantEvent): void {
    switch (event.type) {
      case 'turnStarted':
        this.chunker = new SentenceChunker();
        this.queue.newTurn();
        break;
      case 'text':
        this.timing?.mark('firstDelta');
        if (this.enabled() && this.autoSpeak()) {
          this.speak(this.chunker.push(event.delta));
        }
        break;
      case 'turnDone':
        if (event.outcome === 'done') {
          if (this.enabled() && this.autoSpeak())
            this.speak(this.chunker.flush());
        } else {
          this.queue.stop();
        }
        break;
      case 'error':
        this.queue.stop();
        break;
    }
  }

  private speak(sentences: string[]): void {
    // Never talk over the user: while they hold or wait on a transcript, drop it.
    if (this.current() !== 'idle' && this.current() !== 'speaking') return;
    const options = {
      language: this.settings.language(),
      style: this.style(),
    };
    for (const sentence of sentences) this.queue.push(sentence, options);
  }

  /** Logs the stages of a spoken turn once, at its first audio, in dev. */
  private reportTiming(): void {
    const timing = this.timing;
    if (!timing) return;
    this.timing = undefined;
    timing.mark('firstAudio');
    if (isDevMode()) console.info('[ascua:timing]', timing.report());
  }

  private fail(e: unknown): void {
    this.capture.cancel();
    this.progress.set(null);
    this.failure.set(toAscuaError(e));
    this.setState('idle');
  }

  /** Synchronous, like `RoomState`: the body attribute and main must not lag. */
  private setState(state: VoiceState): void {
    this.current.set(state);
    document.body.dataset['voice'] = state;
    this.companion.voice(
      state === 'listening'
        ? 'listening'
        : state === 'speaking'
          ? 'speaking'
          : null,
    );
    // Only while the pointer may be held: a longer flag would make the compact
    // window block desktop clicks during downloads and replies.
    const active = state === 'listening';
    if (active !== this.active) {
      this.active = active;
      void this.api?.setVoiceActive(active).catch(() => undefined);
    }
  }
}
