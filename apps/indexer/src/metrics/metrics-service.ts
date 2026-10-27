import { Context, Effect, Layer } from 'effect';
import type { ToolCallTotals } from '../db/models';
import { SqliteClient, type SqliteError } from '../db/sqlite-client';

export interface ToolCall {
  readonly tool: string;
  /** Epoch ms. */
  readonly startedAt: number;
  readonly durationMs: number;
  readonly tokens: number;
  readonly maxTokens?: number;
  readonly results?: number;
  readonly ok: boolean;
  readonly error?: string;
}

export interface MetricsServiceShape {
  /** Never fails and never writes stdout (the MCP transport owns it). */
  readonly record: (call: ToolCall) => Effect.Effect<void>;
  readonly totals: (
    since?: number,
  ) => Effect.Effect<ToolCallTotals[], SqliteError>;
}

interface TotalsRow {
  tool: string;
  calls: number;
  tokens: number;
  avg_ms: number;
  max_ms: number;
  errors: number;
}

const totalsFrom = (r: TotalsRow): ToolCallTotals => ({
  tool: r.tool,
  calls: r.calls,
  tokens: r.tokens,
  avgMs: r.avg_ms,
  maxMs: r.max_ms,
  errors: r.errors,
});

const AGGREGATE = `COUNT(*) AS calls, COALESCE(SUM(tokens), 0) AS tokens,
  COALESCE(AVG(duration_ms), 0) AS avg_ms, COALESCE(MAX(duration_ms), 0) AS max_ms,
  COALESCE(SUM(1 - ok), 0) AS errors`;

export class MetricsService extends Context.Service<
  MetricsService,
  MetricsServiceShape
>()('indexer/MetricsService') {
  static readonly layer: Layer.Layer<MetricsService, never, SqliteClient> =
    Layer.effect(
      MetricsService,
      Effect.gen(function* () {
        const db = yield* SqliteClient;

        const record: MetricsServiceShape['record'] = (call) =>
          db
            .run(
              `INSERT INTO tool_calls
                 (tool, started_at, duration_ms, tokens, max_tokens, results, ok, error)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                call.tool,
                call.startedAt,
                call.durationMs,
                call.tokens,
                call.maxTokens ?? null,
                call.results ?? null,
                call.ok ? 1 : 0,
                call.error ?? null,
              ],
            )
            .pipe(
              Effect.asVoid,
              Effect.catchCause((cause) =>
                Effect.sync(() =>
                  console.error('[indexer] metrics record failed', cause),
                ),
              ),
            );

        const totals: MetricsServiceShape['totals'] = (since = 0) =>
          Effect.gen(function* () {
            const [overall, perTool] = [
              yield* db.all<TotalsRow>(
                `SELECT '*' AS tool, ${AGGREGATE} FROM tool_calls
                 WHERE started_at >= ?`,
                [since],
              ),
              yield* db.all<TotalsRow>(
                `SELECT tool, ${AGGREGATE} FROM tool_calls
                 WHERE started_at >= ? GROUP BY tool ORDER BY tool`,
                [since],
              ),
            ];
            return [...overall, ...perTool].map(totalsFrom);
          });

        return MetricsService.of({ record, totals });
      }),
    );
}
