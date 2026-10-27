import { createModelCache } from './model-cache';

export interface ThreadEnv {
  sab: boolean;
  cores: number | undefined;
}

/**
 * Wasm threads for onnxruntime: cores - 1 when SharedArrayBuffer exists, else 1.
 * Main enables the `SharedArrayBuffer` Chromium feature (no cross-origin
 * isolation); the browser preview has no switch and stays single-threaded.
 */
export function wasmThreads(
  env: ThreadEnv = {
    sab: typeof SharedArrayBuffer === 'function',
    cores: globalThis.navigator?.hardwareConcurrency,
  },
): number {
  if (!env.sab) return 1;
  return Math.max(1, (env.cores ?? 1) - 1);
}

/** Shared by both workers. */
export function ortWasmOptions(): { wasmPaths: string; numThreads: number } {
  return {
    wasmPaths: new URL('voice-runtime/', self.location.href).href,
    numThreads: wasmThreads(),
  };
}

interface TransformersEnv {
  allowLocalModels: boolean;
  useBrowserCache: boolean;
  useCustomCache: boolean;
  customCache: unknown;
  backends: { onnx: { wasm?: Record<string, unknown> } };
}

export type VoiceDevice = { kind: 'webgpu'; f16: boolean } | { kind: 'wasm' };

interface GpuAdapterLike {
  features: { has(name: string): boolean };
}

interface GpuLike {
  requestAdapter(): Promise<GpuAdapterLike | null>;
}

/**
 * WebGPU when the browser gives an adapter, wasm otherwise (no `navigator.gpu`,
 * a null adapter or a throwing request all fall back).
 */
export async function detectDevice(
  gpu: GpuLike | undefined = (globalThis.navigator as { gpu?: GpuLike })?.gpu,
): Promise<VoiceDevice> {
  if (!gpu) return { kind: 'wasm' };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { kind: 'wasm' };
    return { kind: 'webgpu', f16: adapter.features.has('shader-f16') };
  } catch {
    return { kind: 'wasm' };
  }
}

export function configureRuntime(env: TransformersEnv): void {
  env.allowLocalModels = false;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = createModelCache();
  const wasm = (env.backends.onnx.wasm ??= {});
  Object.assign(wasm, ortWasmOptions());
}
