import { decodeError } from '@ascua/ipc';
import { MicCapture } from './mic-capture';

function devices(error: unknown): MediaDevices {
  return {
    getUserMedia: vi.fn(() => Promise.reject(error)),
  } as unknown as MediaDevices;
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return decodeError((e as Error).message)?.code;
  }
  return undefined;
}

describe('MicCapture errors', () => {
  it('maps a denied permission', async () => {
    const mic = new MicCapture(
      devices(new DOMException('x', 'NotAllowedError')),
    );
    expect(await codeOf(mic.start())).toBe('voice.micDenied');
  });

  it('maps a security error to denied', async () => {
    const mic = new MicCapture(devices(new DOMException('x', 'SecurityError')));
    expect(await codeOf(mic.start())).toBe('voice.micDenied');
  });

  it('maps a missing device', async () => {
    const mic = new MicCapture(devices(new DOMException('x', 'NotFoundError')));
    expect(await codeOf(mic.start())).toBe('voice.micUnavailable');
  });

  it('reports no media devices as unavailable', async () => {
    expect(await codeOf(new MicCapture(undefined).start())).toBe(
      'voice.micUnavailable',
    );
  });

  it('stop without start yields empty audio', async () => {
    const audio = await new MicCapture(undefined).stop();
    expect(audio.length).toBe(0);
  });
});
