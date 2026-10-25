import { join } from 'node:path';
import { ChatError } from '@ascua/chat';

// Webpack replaces `require`; this is the real Node one at runtime.
declare const __non_webpack_require__: NodeJS.Require | undefined;

export type ClaudeSdk = typeof import('@anthropic-ai/claude-agent-sdk');

export interface ClaudeExecutable {
  path: string;
  /** Set when the CLI is a JS file that must run under Electron-as-node. */
  executable?: string;
  env?: Record<string, string>;
}

let sdk: Promise<ClaudeSdk> | undefined;

/** ESM bridge from the CJS main bundle. Memoized; failure is `agentMissing`. */
export function loadClaudeSdk(): Promise<ClaudeSdk> {
  sdk ??= import(
    /* webpackIgnore: true */ '@anthropic-ai/claude-agent-sdk'
  ).catch((cause) => {
    sdk = undefined;
    throw new ChatError('agentMissing', undefined, String(cause));
  });
  return sdk;
}

export function unpackedPath(p: string): string {
  return p.replace(/app\.asar(?=[\\/]|$)/, 'app.asar.unpacked');
}

function isMusl(): boolean {
  if (process.platform !== 'linux') return false;
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined;
  return !report?.header?.glibcVersionRuntime;
}

export function platformPackage(
  platform = process.platform,
  arch = process.arch,
  musl = isMusl(),
): string {
  return `@anthropic-ai/claude-agent-sdk-${platform}-${arch}${musl ? '-musl' : ''}`; // i18n-ignore: npm package name
}

type Resolve = (id: string) => string;

function defaultResolve(): Resolve {
  const req =
    typeof __non_webpack_require__ === 'function'
      ? __non_webpack_require__
      : require;
  return (id) => req.resolve(id);
}

/** The native binary: no system node is needed. */
export function claudeExecutable(
  resolve: Resolve = defaultResolve(),
  platform = process.platform,
): ClaudeExecutable {
  const pkg = platformPackage(platform);
  try {
    const dir = join(resolve(`${pkg}/package.json`), '..');
    return {
      path: unpackedPath(
        join(dir, platform === 'win32' ? 'claude.exe' : 'claude'),
      ),
    };
  } catch {
    // Some versions ship a JS cli instead of a per-platform binary.
    try {
      const dir = join(
        resolve('@anthropic-ai/claude-agent-sdk/package.json'),
        '..',
      );
      return {
        path: unpackedPath(join(dir, 'cli.js')),
        executable: process.execPath,
        env: { ELECTRON_RUN_AS_NODE: '1' },
      };
    } catch (cause) {
      throw new ChatError('agentMissing', undefined, String(cause));
    }
  }
}

/** The native binary must not inherit ELECTRON_RUN_AS_NODE. */
export function claudeEnv(
  env: NodeJS.ProcessEnv,
  exe?: ClaudeExecutable,
): Record<string, string | undefined> {
  const out = { ...env };
  delete out['ELECTRON_RUN_AS_NODE'];
  return exe?.env ? { ...out, ...exe.env } : out;
}
