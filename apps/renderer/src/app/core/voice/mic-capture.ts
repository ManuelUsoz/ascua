import { encodeError } from '@ascua/ipc';
import type { AudioCapture } from './ports';

const MAX_MS = 30_000;
const SAMPLE_RATE = 16_000;

function failure(code: 'voice.micDenied' | 'voice.micUnavailable'): Error {
  return new Error(encodeError({ code }));
}

/** Maps a `getUserMedia` rejection to a voice error. */
export function micError(error: unknown): Error {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return failure('voice.micDenied');
  }
  return failure('voice.micUnavailable');
}

/** Records the microphone with `MediaRecorder` and decodes to 16 kHz mono. */
export class MicCapture implements AudioCapture {
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private cap?: ReturnType<typeof setTimeout>;
  private finished?: Promise<void>;

  constructor(private readonly mediaDevices: MediaDevices | undefined) {}

  async start(): Promise<void> {
    if (!this.mediaDevices) throw failure('voice.micUnavailable');
    this.cancel();
    let stream: MediaStream;
    try {
      stream = await this.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
    } catch (e) {
      throw micError(e);
    }
    this.stream = stream;
    this.chunks = [];
    const recorder = new MediaRecorder(stream);
    this.recorder = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    this.cap = setTimeout(() => this.halt(), MAX_MS);
  }

  async stop(): Promise<Float32Array> {
    const recorder = this.recorder;
    const finished = this.finished;
    if (!recorder || !finished) return new Float32Array(0);
    this.halt();
    await finished;
    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    this.release();
    if (blob.size === 0) return new Float32Array(0);
    const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < mono.length; i++)
        mono[i] += data[i] / decoded.numberOfChannels;
    }
    return mono;
  }

  cancel(): void {
    this.halt();
    this.release();
  }

  private halt(): void {
    if (this.cap !== undefined) clearTimeout(this.cap);
    this.cap = undefined;
    if (this.recorder && this.recorder.state !== 'inactive')
      this.recorder.stop();
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.recorder = undefined;
    this.finished = undefined;
    this.chunks = [];
  }
}
