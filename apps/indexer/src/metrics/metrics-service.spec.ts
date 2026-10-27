import { Effect, Layer } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { SqliteClient } from '../db/sqlite-client';
import { MetricsService, type ToolCall } from './metrics-service';

const run = <A, E>(
  program: (m: MetricsService['Service']) => Effect.Effect<A, E>,
): Promise<A> => {
  const layer = Layer.provide(
    MetricsService.layer,
    SqliteClient.layer(':memory:'),
  );
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        return yield* program(yield* MetricsService);
      }),
    ).pipe(Effect.provide(layer)),
  );
};

const call = (over: Partial<ToolCall> = {}): ToolCall => ({
  tool: 'search_symbols',
  startedAt: 1000,
  durationMs: 10,
  tokens: 100,
  ok: true,
  ...over,
});

describe('MetricsService', () => {
  it('records calls and aggregates them', async () => {
    const totals = await run((m) =>
      Effect.gen(function* () {
        yield* m.record(call());
        yield* m.record(call({ durationMs: 30, tokens: 50, ok: false }));
        yield* m.record(call({ tool: 'get_file_outline', startedAt: 5 }));
        return yield* m.totals(10);
      }),
    );
    expect(totals).toEqual([
      { tool: '*', calls: 2, tokens: 150, avgMs: 20, maxMs: 30, errors: 1 },
      {
        tool: 'search_symbols',
        calls: 2,
        tokens: 150,
        avgMs: 20,
        maxMs: 30,
        errors: 1,
      },
    ]);
  });

  it('does not fail when recording on a broken db', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = Layer.succeed(
      SqliteClient,
      SqliteClient.of({
        run: () => Effect.die('boom'),
      } as unknown as SqliteClient['Service']),
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const m = yield* MetricsService;
        yield* m.record(call());
      }).pipe(Effect.provide(Layer.provide(MetricsService.layer, broken))),
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
