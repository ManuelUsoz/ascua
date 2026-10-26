/** Plays one PCM clip at a time through Web Audio. */
export class AudioPlayer {
  private context?: AudioContext;
  private current?: AudioBufferSourceNode;

  play(
    pcm: Float32Array,
    sampleRate: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    this.context ??= new AudioContext();
    const context = this.context;
    const buffer = context.createBuffer(1, pcm.length, sampleRate);
    buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    this.current = source;

    return new Promise<void>((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', onAbort);
        if (this.current === source) this.current = undefined;
        resolve();
      };
      const onAbort = () => {
        try {
          source.stop();
        } catch {
          // already stopped
        }
        done();
      };
      source.onended = done;
      signal.addEventListener('abort', onAbort, { once: true });
      void context.resume().then(() => source.start());
    });
  }

  stop(): void {
    try {
      this.current?.stop();
    } catch {
      // already stopped
    }
    this.current = undefined;
  }
}
