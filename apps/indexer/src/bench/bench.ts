import type {
  BenchmarkCase,
  BenchmarkCaseResult,
  BenchmarkReport,
} from '@ascua/ipc';
import { Clock, Effect, Layer } from 'effect';
import { toolHandlers } from '../mcp/server';
import { MetricsService } from '../metrics/metrics-service';
import { estimateTokens, QueryService } from '../query/query-service';

export interface BenchProgress {
  done: number;
  total: number;
}

/** Benchmark runs must not leave tool_calls telemetry behind. */
const silentMetrics = Layer.succeed(
  MetricsService,
  MetricsService.of({
    record: () => Effect.void,
    totals: () => Effect.succeed([]),
  }),
);

type Handler = (args: never) => Effect.Effect<string, unknown>;

/** Runs every case through the same handlers the MCP tools use. */
export const runBenchmark = (
  cases: readonly BenchmarkCase[],
  onProgress: (progress: BenchProgress) => void = () => undefined,
): Effect.Effect<BenchmarkReport, never, QueryService> =>
  Effect.gen(function* () {
    const table = (yield* toolHandlers(undefined)) as unknown as Record<
      string,
      Handler | undefined
    >;
    const results: BenchmarkCaseResult[] = [];
    for (const item of cases) {
      const handler = table[item.tool];
      const startedAt = yield* Clock.currentTimeMillis;
      const text = handler
        ? yield* handler(item.args as never).pipe(
            Effect.catchCause((cause) => Effect.succeed(`error: ${cause}`)),
          )
        : `error: unknown tool ${item.tool}`;
      const endedAt = yield* Clock.currentTimeMillis;
      const expected = [...item.expectFiles, ...item.expectSymbols];
      const found = expected.filter((e) => text.includes(e)).length;
      results.push({
        id: item.id,
        tool: item.tool,
        hit: found > 0,
        recall: expected.length === 0 ? 1 : found / expected.length,
        tokens: estimateTokens(text),
        ms: endedAt - startedAt,
      });
      onProgress({ done: results.length, total: cases.length });
    }
    const tools = [...new Set(results.map((r) => r.tool))];
    return {
      cases: results,
      perTool: tools.map((tool) => {
        const rows = results.filter((r) => r.tool === tool);
        const avg = (f: (r: BenchmarkCaseResult) => number) =>
          rows.reduce((n, r) => n + f(r), 0) / rows.length;
        return {
          tool,
          hitRate: avg((r) => (r.hit ? 1 : 0)),
          avgTokens: avg((r) => r.tokens),
          avgMs: avg((r) => r.ms),
        };
      }),
    };
  }).pipe(Effect.provide(silentMetrics));
