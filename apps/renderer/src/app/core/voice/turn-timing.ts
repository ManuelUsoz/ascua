export interface TurnTimingReport {
  releaseToTranscriptMs?: number;
  transcriptToFirstDeltaMs?: number;
  firstDeltaToFirstAudioMs?: number;
  totalMs?: number;
}

type Mark = 'released' | 'transcribed' | 'sent' | 'firstDelta' | 'firstAudio';

/** Stage marks of one spoken turn, from releasing the key to the first audio. */
export class TurnTiming {
  private readonly marks = new Map<Mark, number>();

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Records a mark once; later calls for the same mark are ignored. */
  mark(name: Mark): void {
    if (!this.marks.has(name)) this.marks.set(name, this.now());
  }

  has(name: Mark): boolean {
    return this.marks.has(name);
  }

  report(): TurnTimingReport {
    const span = (from: Mark, to: Mark): number | undefined => {
      const a = this.marks.get(from);
      const b = this.marks.get(to);
      return a === undefined || b === undefined ? undefined : Math.round(b - a);
    };
    return {
      releaseToTranscriptMs: span('released', 'transcribed'),
      transcriptToFirstDeltaMs: span('transcribed', 'firstDelta'),
      firstDeltaToFirstAudioMs: span('firstDelta', 'firstAudio'),
      totalMs: span('released', 'firstAudio'),
    };
  }
}
