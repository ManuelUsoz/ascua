import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  NodeFileSystem,
  NodePath,
  NodeRuntime,
  NodeStdio,
} from '@effect/platform-node';
import { Effect, Layer, Logger, Runtime } from 'effect';
import { IndexerService } from './index/indexer-service';
import { SqliteClient } from './db/sqlite-client';
import { BENCHMARK_CASES } from './bench/cases';
import { runBenchmark } from './bench/bench';
import { mcpLayer } from './mcp/server';
import { MetricsService } from './metrics/metrics-service';
import { QueryService } from './query/query-service';

const USAGE =
  'usage: main.mjs index <root> [--db <file>] | mcp <root> [--db <file>] [--max-tokens <n>] | stats <root> [--db <file>] | bench <root> [--db <file>]';

const flag = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const trace = (message: string) =>
  process.stderr.write(`[indexer] ${message}\n`);
const describe = (e: unknown) =>
  e instanceof Error ? (e.stack ?? e.message) : String(e);

process.on('uncaughtException', (e) => {
  trace(`uncaughtException: ${describe(e)}`);
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  trace(`unhandledRejection: ${describe(e)}`);
  process.exit(1);
});

const [command, rootArg, ...rest] = process.argv.slice(2);
if (
  (command !== 'index' &&
    command !== 'mcp' &&
    command !== 'stats' &&
    command !== 'bench') ||
  !rootArg
) {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

const root = resolve(rootArg);
const dbFile = resolve(flag(rest, '--db') ?? `${root}/.ascua/index.db`);
trace(`start ${command} root=${root} db=${dbFile} node=${process.version}`);
mkdirSync(dirname(dbFile), { recursive: true });

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const base = Layer.merge(platform, SqliteClient.layer(dbFile));

const indexRun = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* (yield* IndexerService).indexProject(root);
  }),
).pipe(Layer.provide(IndexerService.layer), Layer.provide(base));

const maxTokens = Number(flag(rest, '--max-tokens'));

// stdout is the protocol in mcp mode: logs go to stderr.
const stderrLogger = Logger.layer([
  Logger.withConsoleError(Logger.consoleLogFmt),
]);

const mcpRun = mcpLayer(
  Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : undefined,
).pipe(
  Layer.provide(Layer.merge(QueryService.layer(root), MetricsService.layer)),
  Layer.provide(base),
  Layer.provide(NodeStdio.layer),
  Layer.provide(stderrLogger),
);

const statsRun = Effect.gen(function* () {
  const totals = yield* (yield* MetricsService).totals();
  process.stdout.write(`${JSON.stringify(totals)}\n`);
}).pipe(Effect.provide(MetricsService.layer), Effect.provide(base));

// stdout: one `{"done","total"}` line per case, then the BenchmarkReport line.
const benchRun = Effect.gen(function* () {
  const report = yield* runBenchmark(BENCHMARK_CASES, (p) =>
    process.stdout.write(`${JSON.stringify(p)}\n`),
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
}).pipe(Effect.provide(QueryService.layer(root)), Effect.provide(base));

if (command === 'bench') {
  NodeRuntime.runMain(Effect.scoped(benchRun), {
    teardown: (exit, onExit) =>
      Runtime.defaultTeardown(exit, (code) => {
        onExit(code);
        process.exit(code);
      }),
  });
} else if (command === 'index') {
  // The run is a one-shot: building the layer does the work, then exit.
  // runMain only exits on failure; on success it waits for an empty event
  // loop, which never happens in an Electron utility process (parentPort
  // keeps it alive), so main would never see `exit` and never emit `done`.
  NodeRuntime.runMain(
    Effect.scoped(Layer.build(indexRun)).pipe(
      Effect.tap(() => Effect.sync(() => trace('index finished'))),
      Effect.tapCause((cause) =>
        Effect.sync(() => trace(`index failed: ${String(cause)}`)),
      ),
    ),
    {
      teardown: (exit, onExit) =>
        Runtime.defaultTeardown(exit, (code) => {
          onExit(code);
          process.exit(code);
        }),
    },
  );
} else if (command === 'stats') {
  NodeRuntime.runMain(Effect.scoped(statsRun));
} else {
  NodeRuntime.runMain(Layer.launch(mcpRun));
}
