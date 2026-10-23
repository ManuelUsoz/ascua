const MAX_CHARS = 512 * 1024;

export interface BufferChunk {
  data: string;
  seq: number;
}

/**
 * Bounded replay ring for one terminal. `seq` is the total number of chars
 * ever pushed, so a snapshot and the live chunks that follow can be
 * de-duplicated by the consumer.
 */
export class OutputBuffer {
  private history = '';
  private pending = '';
  private total = 0;

  constructor(private readonly max = MAX_CHARS) {}

  push(data: string): void {
    if (!data) return;
    this.history += data;
    this.pending += data;
    this.total += data.length;
    if (this.history.length > this.max) this.trim();
  }

  /** The batch pushed since the last take. */
  take(): BufferChunk | undefined {
    if (!this.pending) return undefined;
    const data = this.pending;
    this.pending = '';
    return { data, seq: this.total };
  }

  snapshot(): BufferChunk {
    return { data: this.history, seq: this.total };
  }

  private trim(): void {
    const overflow = this.history.length - this.max;
    const newline = this.history.indexOf('\n', overflow);
    this.history = newline === -1 ? this.history.slice(overflow) : this.history.slice(newline + 1);
  }
}
