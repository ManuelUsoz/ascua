import { describe, expect, it } from 'vitest';
import {
  supertonicProviders,
  WHISPER_CPU,
  WHISPER_GPU,
  whisperProfile,
} from './voice-models';

describe('whisperProfile', () => {
  it('uses large-v3-turbo on WebGPU with f16', () => {
    expect(whisperProfile({ kind: 'webgpu', f16: true })).toBe(WHISPER_GPU);
    expect(WHISPER_GPU.model).toBe('onnx-community/whisper-large-v3-turbo');
  });

  it('uses whisper-small without f16 or without a GPU', () => {
    expect(whisperProfile({ kind: 'webgpu', f16: false })).toBe(WHISPER_CPU);
    expect(whisperProfile({ kind: 'wasm' })).toBe(WHISPER_CPU);
    expect(WHISPER_CPU.model).toBe('onnx-community/whisper-small');
  });

  it('keeps the byte totals true to the file lists', () => {
    for (const profile of [WHISPER_GPU, WHISPER_CPU]) {
      expect(profile.bytes).toBe(
        profile.files.reduce((sum, f) => sum + f.bytes, 0),
      );
    }
    expect(WHISPER_GPU.bytes).toBe(565_959_712);
    expect(WHISPER_CPU.bytes).toBe(251_846_613);
  });
});

describe('supertonicProviders', () => {
  it('tries WebGPU first, then wasm', () => {
    expect(supertonicProviders({ kind: 'webgpu', f16: false })).toEqual([
      'webgpu',
      'wasm',
    ]);
    expect(supertonicProviders({ kind: 'wasm' })).toEqual(['wasm']);
  });
});
