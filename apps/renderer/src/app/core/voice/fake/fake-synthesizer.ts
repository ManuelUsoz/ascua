import type { LoadProgress, SpeechSynthesizer, SpokenClip } from '../ports';

declare global {
  interface Window {
    /** Sentences "spoken" by the fake synthesizer (ui-drive only). */
    __ascuaSpoken?: string[];
  }
}

const SILENT: SpokenClip = { play: () => Promise.resolve() };

/** Test seam (`ASCUA_VOICE_FAKE`): records sentences and plays nothing. */
export class FakeSpeechSynthesizer implements SpeechSynthesizer {
  load(onProgress: (progress: LoadProgress) => void): Promise<void> {
    onProgress({ engine: 'tts', loaded: 1, total: 1 });
    return Promise.resolve();
  }

  render(sentence: string): Promise<SpokenClip> {
    (window.__ascuaSpoken ??= []).push(sentence);
    return Promise.resolve(SILENT);
  }

  stop(): void {
    // nothing plays
  }

  dispose(): void {
    // nothing to free
  }
}
