import { describe, expect, it } from 'vitest';
import type {
  LoadProgress,
  SpeakOptions,
  SpeechSynthesizer,
  SpokenClip,
} from './ports';
import { SpeechQueue } from './speech-queue';

const OPTS: SpeakOptions = { language: 'es', style: 'F1' };
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

class FakeSynth implements SpeechSynthesizer {
  log: string[] = [];
  rendered: { sentence: string; options: SpeakOptions }[] = [];
  failOn = new Set<string>();
  stops = 0;
  releases = new Map<string, () => void>();
  load(_: (p: LoadProgress) => void): Promise<void> {
    return Promise.resolve();
  }
  render(sentence: string, options: SpeakOptions): Promise<SpokenClip> {
    this.log.push(`render ${sentence}`);
    this.rendered.push({ sentence, options });
    if (this.failOn.has(sentence)) return Promise.reject(new Error('x'));
    return Promise.resolve({
      play: (signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          this.log.push(`play ${sentence}`);
          this.releases.set(sentence, resolve);
          signal.addEventListener('abort', () => resolve());
        }),
    });
  }
  stop(): void {
    this.stops++;
  }
  dispose(): void {
    // nothing
  }
}

describe('SpeechQueue', () => {
  it('plays in order and renders the next while one plays', async () => {
    const synth = new FakeSynth();
    const speaking: boolean[] = [];
    const q = new SpeechQueue(synth, (s) => speaking.push(s));
    q.push('a', OPTS);
    q.push('b', OPTS);
    await tick();
    expect(synth.log).toEqual(['render a', 'render b', 'play a']);
    synth.releases.get('a')?.();
    await tick();
    expect(synth.log.slice(-1)).toEqual(['play b']);
    synth.releases.get('b')?.();
    await tick();
    expect(speaking).toEqual([true, false]);
  });

  it('passes options through', async () => {
    const synth = new FakeSynth();
    const q = new SpeechQueue(synth, () => undefined);
    q.push('hello', { language: 'en', style: 'M2' });
    await tick();
    expect(synth.rendered[0].options).toEqual({ language: 'en', style: 'M2' });
  });

  it('stop aborts the current clip, clears and stops the synth', async () => {
    const synth = new FakeSynth();
    const speaking: boolean[] = [];
    const q = new SpeechQueue(synth, (s) => speaking.push(s));
    q.push('a', OPTS);
    q.push('b', OPTS);
    q.push('c', OPTS);
    await tick();
    q.stop();
    await tick();
    expect(synth.stops).toBe(1);
    expect(synth.log).not.toContain('play b');
    expect(speaking).toEqual([true, false]);
    q.push('d', OPTS);
    await tick();
    expect(synth.log).toContain('play d');
  });

  it('skips a failed render and reports once per turn', async () => {
    const synth = new FakeSynth();
    synth.failOn = new Set(['a', 'b']);
    let errors = 0;
    const q = new SpeechQueue(
      synth,
      () => undefined,
      () => errors++,
    );
    q.push('a', OPTS);
    q.push('b', OPTS);
    q.push('c', OPTS);
    await tick();
    expect(errors).toBe(1);
    expect(synth.log).toContain('play c');
  });
});
