import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  claudeEnv,
  claudeExecutable,
  platformPackage,
  unpackedPath,
} from './claude-runtime';

describe('claude-runtime', () => {
  it('rewrites app.asar to app.asar.unpacked', () => {
    expect(unpackedPath('C:\\x\\resources\\app.asar\\node_modules\\a')).toBe(
      'C:\\x\\resources\\app.asar.unpacked\\node_modules\\a',
    );
    expect(unpackedPath('/a/app.asar.unpacked/b')).toBe(
      '/a/app.asar.unpacked/b',
    );
  });

  it('names the platform package', () => {
    expect(platformPackage('win32', 'x64', false)).toBe(
      '@anthropic-ai/claude-agent-sdk-win32-x64',
    );
    expect(platformPackage('linux', 'arm64', true)).toBe(
      '@anthropic-ai/claude-agent-sdk-linux-arm64-musl',
    );
  });

  it('resolves a real executable', () => {
    const req = createRequire(`${process.cwd()}/package.json`);
    const exe = claudeExecutable((id) => req.resolve(id));
    expect(existsSync(exe.path)).toBe(true);
  });

  it('drops ELECTRON_RUN_AS_NODE for the native binary', () => {
    expect(claudeEnv({ ELECTRON_RUN_AS_NODE: '1', A: 'b' })).toEqual({
      A: 'b',
    });
  });
});
