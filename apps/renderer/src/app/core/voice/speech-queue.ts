import type { SpeakOptions, SpeechSynthesizer, SpokenClip } from './ports';

interface Item {
  sentence: string;
  options: SpeakOptions;
}

/**
 * Speaks sentences in order, rendering the next one while the current clip
 * plays. A failed render skips that sentence and is reported once per turn.
 */
export class SpeechQueue {
  private pending: Item[] = [];
  private running = false;
  private generation = 0;
  private abort = new AbortController();
  private reported = false;

  constructor(
    private readonly synth: SpeechSynthesizer,
    private readonly onSpeaking: (speaking: boolean) => void,
    private readonly onError: () => void = () => undefined,
  ) {}

  /** Call at the start of a turn so a render failure is reported again. */
  newTurn(): void {
    this.reported = false;
  }

  push(sentence: string, options: SpeakOptions): void {
    this.pending.push({ sentence, options });
    if (!this.running) void this.loop();
  }

  stop(): void {
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    this.pending = [];
    this.reported = false;
    this.synth.stop();
    if (this.running) {
      this.running = false;
      this.onSpeaking(false);
    }
  }

  private startRender(): Promise<SpokenClip | null> | undefined {
    const item = this.pending.shift();
    if (!item) return undefined;
    return this.synth.render(item.sentence, item.options).catch(() => {
      if (!this.reported) {
        this.reported = true;
        this.onError();
      }
      return null;
    });
  }

  private async loop(): Promise<void> {
    const gen = this.generation;
    const signal = this.abort.signal;
    this.running = true;
    this.onSpeaking(true);
    let current = this.startRender();
    while (current) {
      const clip = await current;
      if (gen !== this.generation) return;
      const ahead = this.startRender();
      if (clip) {
        try {
          await clip.play(signal);
        } catch {
          // aborted or a playback failure: the text is already on screen
        }
        if (gen !== this.generation) return;
      }
      current = ahead ?? this.startRender();
    }
    this.running = false;
    this.onSpeaking(false);
  }
}
