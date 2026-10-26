import { describe, expect, it } from 'vitest';
import { resolveClaude } from './claude-binary';

const has =
  (...paths: string[]) =>
  (p: string) =>
    paths.includes(p);

describe('resolveClaude', () => {
  it('prefers the override and runs scripts under electron-as-node', () => {
    const c = resolveClaude(
      'linux',
      { ASCUA_CLAUDE_CLI: '/t/fake.mjs' },
      has('/t/fake.mjs'),
      '/electron',
    );
    expect(c).toEqual({
      file: '/electron',
      prefixArgs: ['/t/fake.mjs'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      shell: false,
    });
  });

  it('keeps a missing override so spawn reports ENOENT', () => {
    const c = resolveClaude('linux', { ASCUA_CLAUDE_CLI: '/nope.mjs' }, has());
    expect(c?.file).toBe('/nope.mjs');
    expect(c?.prefixArgs).toEqual([]);
  });

  it('finds claude.exe, then claude.cmd, on the Windows PATH', () => {
    const env = { Path: 'C:\\a;C:\\b' };
    expect(resolveClaude('win32', env, has('C:\\b\\claude.exe'))).toMatchObject(
      {
        file: 'C:\\b\\claude.exe',
        shell: false,
      },
    );
    expect(resolveClaude('win32', env, has('C:\\a\\claude.cmd'))).toMatchObject(
      {
        file: 'C:\\a\\claude.cmd',
        shell: true,
      },
    );
  });

  it('falls back to the user local bin', () => {
    expect(
      resolveClaude(
        'win32',
        { USERPROFILE: 'C:\\u' },
        has('C:\\u\\.local\\bin\\claude.exe'),
      )?.file,
    ).toBe('C:\\u\\.local\\bin\\claude.exe');
    expect(
      resolveClaude(
        'linux',
        { PATH: '/x', HOME: '/h' },
        has('/h/.local/bin/claude'),
      )?.file,
    ).toBe('/h/.local/bin/claude');
    expect(
      resolveClaude('linux', { PATH: '/x:/usr/bin' }, has('/usr/bin/claude'))
        ?.file,
    ).toBe('/usr/bin/claude');
  });

  it('returns undefined when nothing is found', () => {
    expect(resolveClaude('linux', { PATH: '/x' }, has())).toBeUndefined();
    expect(resolveClaude('win32', { Path: 'C:\\a' }, has())).toBeUndefined();
  });
});
