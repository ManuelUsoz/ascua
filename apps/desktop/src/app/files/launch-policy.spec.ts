import { describe, expect, it } from 'vitest';
import { isOpenable } from './launch-policy';

const info = { binary: false, mode: 0o644, platform: 'win32' as const };
const linux = { ...info, platform: 'linux' as const };

describe('isOpenable', () => {
  it('allows allowlisted documents, case-insensitively', () => {
    for (const name of ['README.md', 'web/src/app.ts', 'a\\b.JSON', 'x.yml', 'main.rs']) {
      expect(isOpenable(name, info)).toBe(true);
      expect(isOpenable(name, linux)).toBe(true);
    }
  });

  it('refuses binary files', () => {
    expect(isOpenable('logo.png', { ...info, binary: true })).toBe(false);
  });

  it('refuses anything not allowlisted', () => {
    for (const name of ['x.sh', 'x.py', 'x.js', 'x.mjs', 'run.cmd', 'x.ps1', 'Setup.EXE', 'x.Bat', 'x.rb']) {
      expect(isOpenable(name, info)).toBe(false);
    }
  });

  it('ignores trailing dots and spaces', () => {
    expect(isOpenable('x.cmd.', info)).toBe(false);
    expect(isOpenable('x.bat ', info)).toBe(false);
    expect(isOpenable('x.md.', info)).toBe(true);
  });

  it('refuses files without extension', () => {
    expect(isOpenable('LICENSE', info)).toBe(false);
    expect(isOpenable('dir.d/LICENSE', info)).toBe(false);
  });

  it('refuses files with an execute bit off Windows', () => {
    expect(isOpenable('notes.md', { ...linux, mode: 0o755 })).toBe(false);
    expect(isOpenable('notes.md', { ...info, mode: 0o755 })).toBe(true);
  });
});
