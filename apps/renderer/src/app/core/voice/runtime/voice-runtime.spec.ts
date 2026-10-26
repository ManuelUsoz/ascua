import { describe, expect, it } from 'vitest';
import { detectDevice, wasmThreads } from './voice-runtime';

describe('wasmThreads', () => {
  it('is 1 without SharedArrayBuffer', () => {
    expect(wasmThreads({ sab: false, cores: 8 })).toBe(1);
  });

  it('uses cores - 1', () => {
    expect(wasmThreads({ sab: true, cores: 8 })).toBe(7);
  });

  it('is 1 on a single core', () => {
    expect(wasmThreads({ sab: true, cores: 1 })).toBe(1);
  });

  it('is 1 when cores are unknown', () => {
    expect(wasmThreads({ sab: true, cores: undefined })).toBe(1);
  });
});

const adapter = (features: string[]) => ({
  features: new Set(features),
});

describe('detectDevice', () => {
  it('falls back to wasm without navigator.gpu', async () => {
    expect(await detectDevice(undefined)).toEqual({ kind: 'wasm' });
  });

  it('falls back to wasm on a null adapter', async () => {
    const gpu = { requestAdapter: async () => null };
    expect(await detectDevice(gpu)).toEqual({ kind: 'wasm' });
  });

  it('falls back to wasm when the request throws', async () => {
    const gpu = {
      requestAdapter: async () => {
        throw new Error('no gpu');
      },
    };
    expect(await detectDevice(gpu)).toEqual({ kind: 'wasm' });
  });

  it('reports shader-f16 support', async () => {
    const withF16 = { requestAdapter: async () => adapter(['shader-f16']) };
    const without = { requestAdapter: async () => adapter([]) };
    expect(await detectDevice(withF16)).toEqual({ kind: 'webgpu', f16: true });
    expect(await detectDevice(without)).toEqual({ kind: 'webgpu', f16: false });
  });
});
