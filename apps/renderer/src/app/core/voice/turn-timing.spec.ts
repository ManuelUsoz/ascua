import { TurnTiming } from './turn-timing';

describe('TurnTiming', () => {
  it('reports each stage and the total', () => {
    let now = 0;
    const timing = new TurnTiming(() => now);
    for (const [mark, at] of [
      ['released', 0],
      ['transcribed', 400],
      ['sent', 410],
      ['firstDelta', 1000],
      ['firstAudio', 1300],
    ] as const) {
      now = at;
      timing.mark(mark);
    }
    expect(timing.report()).toEqual({
      releaseToTranscriptMs: 400,
      transcriptToFirstDeltaMs: 600,
      firstDeltaToFirstAudioMs: 300,
      totalMs: 1300,
    });
  });

  it('keeps the first mark and leaves missing stages undefined', () => {
    let now = 5;
    const timing = new TurnTiming(() => now);
    timing.mark('released');
    now = 50;
    timing.mark('released');
    expect(timing.report().totalMs).toBeUndefined();
    expect(timing.has('released')).toBe(true);
  });
});
