import { InjectionToken } from '@angular/core';
import { AudioPlayer } from './audio-player';
import { FakeSpeechSynthesizer } from './fake/fake-synthesizer';
import { MicCapture } from './mic-capture';
import type {
  AudioCapture,
  SpeechRecognizer,
  SpeechSynthesizer,
} from './ports';
import {
  SupertonicSynthesizer,
  type SynthWorkerLike,
} from './supertonic/supertonic-synthesizer';
import {
  WhisperRecognizer,
  type WorkerLike,
} from './whisper/whisper-recognizer';

/** `|`-separated scripted phrases from `ASCUA_VOICE_FAKE`, or null. */
function fakePhrases(): string[] | null {
  const raw = new URLSearchParams(window.location.search).get('voiceFake');
  return raw === null ? null : raw.split('|');
}

export const AUDIO_CAPTURE = new InjectionToken<AudioCapture>('AUDIO_CAPTURE', {
  providedIn: 'root',
  factory: () => new MicCapture(navigator.mediaDevices),
});

export const SPEECH_RECOGNIZER = new InjectionToken<SpeechRecognizer>(
  'SPEECH_RECOGNIZER',
  {
    providedIn: 'root',
    factory: () => {
      const phrases = fakePhrases();
      return new WhisperRecognizer(
        () =>
          new Worker(new URL('./whisper/whisper.worker', import.meta.url), {
            type: 'module',
          }) as unknown as WorkerLike,
        phrases ? { kind: 'fake', phrases } : { kind: 'whisper' },
      );
    },
  },
);

export const SPEECH_SYNTHESIZER = new InjectionToken<SpeechSynthesizer>(
  'SPEECH_SYNTHESIZER',
  {
    providedIn: 'root',
    factory: () =>
      fakePhrases()
        ? new FakeSpeechSynthesizer()
        : new SupertonicSynthesizer(
            () =>
              new Worker(
                new URL('./supertonic/supertonic.worker', import.meta.url),
                { type: 'module' },
              ) as unknown as SynthWorkerLike,
            new AudioPlayer(),
          ),
  },
);
