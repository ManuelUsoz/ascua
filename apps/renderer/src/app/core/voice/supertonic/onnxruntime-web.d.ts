/**
 * The package's own types do not resolve under this workspace's module
 * resolution, so declare the small surface the Supertonic worker uses.
 */
declare module 'onnxruntime-web' {
  export class Tensor {
    constructor(
      type: 'int64' | 'float32',
      data: BigInt64Array | Float32Array,
      dims: readonly number[],
    );
  }
  export interface SessionOptions {
    executionProviders?: string[];
    graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
  }
  export class InferenceSession {
    static create(
      model: Uint8Array,
      options?: SessionOptions,
    ): Promise<InferenceSession>;
    run(feeds: Record<string, unknown>): Promise<Record<string, unknown>>;
  }
  export const env: { wasm: Record<string, unknown> };
}
