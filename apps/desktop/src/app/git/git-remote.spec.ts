import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOriginUrl, remoteMatches } from './git-remote';

describe('remoteMatches', () => {
  const ok = (url: string) => remoteMatches(url, 'Me/App', 'github.com');
  it('accepts https, scp and ssh forms', () => {
    expect(ok('https://github.com/me/app.git')).toBe(true);
    expect(ok('https://github.com/me/app/')).toBe(true);
    expect(ok('git@github.com:me/app.git')).toBe(true);
    expect(ok('ssh://git@github.com/me/app')).toBe(true);
  });
  it('rejects other repos, hosts and junk', () => {
    expect(ok('https://github.com/me/other.git')).toBe(false);
    expect(ok('https://gitlab.com/me/app.git')).toBe(false);
    expect(ok('not a url')).toBe(false);
  });
});

describe('readOriginUrl', () => {
  it('reads origin and ignores other remotes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ascua-git-'));
    try {
      await mkdir(join(dir, '.git'));
      await writeFile(
        join(dir, '.git', 'config'),
        '[remote "up"]\n\turl = https://x/up.git\n[remote "origin"]\n\turl = https://github.com/me/app.git\n',
      );
      expect(await readOriginUrl(dir)).toBe('https://github.com/me/app.git');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('returns undefined when there is no repository', async () => {
    expect(await readOriginUrl(join(tmpdir(), 'ascua-nope-xyz'))).toBe(
      undefined,
    );
  });
});
