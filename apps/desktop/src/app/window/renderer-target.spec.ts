import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isOwnRendererUrl, rendererTarget, targetUrl } from './renderer-target';

const dir = join(process.cwd(), 'dist', 'apps', 'desktop');

describe('rendererTarget', () => {
  it('uses the dev server when not packaged', () => {
    const t = rendererTarget({ packaged: false, env: {}, dir });
    expect(t).toEqual({
      kind: 'url',
      url: 'http://localhost:4200',
      query: {},
    });
  });

  it('uses the built index when packaged or ASCUA_RENDERER=dist', () => {
    const a = rendererTarget({ packaged: true, env: {}, dir });
    const b = rendererTarget({
      packaged: false,
      env: { ASCUA_RENDERER: 'dist' },
      dir,
    });
    expect(a.kind).toBe('file');
    expect(b).toEqual(a);
  });

  it('adds the voiceFake query only with the env', () => {
    const none = rendererTarget({ packaged: true, env: {}, dir });
    const fake = rendererTarget({
      packaged: true,
      env: { ASCUA_VOICE_FAKE: 'a|b' },
      dir,
    });
    expect(none.query).toEqual({});
    expect(fake.query).toEqual({ voiceFake: 'a|b' });
    const dev = rendererTarget({
      packaged: false,
      env: { ASCUA_VOICE_FAKE: 'a|b' },
      dir,
    });
    if (dev.kind !== 'url') throw new Error('expected url');
    expect(targetUrl(dev)).toBe('http://localhost:4200/?voiceFake=a%7Cb');
  });
});

describe('isOwnRendererUrl', () => {
  const dev = rendererTarget({ packaged: false, env: {}, dir });
  const file = rendererTarget({ packaged: true, env: {}, dir });
  if (file.kind !== 'file') throw new Error('expected file');
  const own = pathToFileURL(file.path).href;

  it('dev: same origin only', () => {
    expect(isOwnRendererUrl('http://localhost:4200/#/x', dev, 'linux')).toBe(
      true,
    );
    expect(isOwnRendererUrl('http://localhost:4300/', dev, 'linux')).toBe(
      false,
    );
    expect(isOwnRendererUrl('https://evil.test/', dev, 'linux')).toBe(false);
    expect(isOwnRendererUrl(undefined, dev, 'linux')).toBe(false);
  });

  it('file: our index with query and hash', () => {
    expect(
      isOwnRendererUrl(`${own}?voiceFake=a#/ajustes`, file, process.platform),
    ).toBe(true);
  });

  it('file: another file or scheme is rejected', () => {
    const other = pathToFileURL(join(dir, 'other.html')).href;
    expect(isOwnRendererUrl(other, file, process.platform)).toBe(false);
    expect(isOwnRendererUrl('http://localhost:4200/', file, 'linux')).toBe(
      false,
    );
    expect(isOwnRendererUrl('not a url', file, 'linux')).toBe(false);
  });

  it('win32 compares case-insensitively', () => {
    if (process.platform !== 'win32') return;
    expect(isOwnRendererUrl(own.toUpperCase(), file, 'win32')).toBe(true);
  });
});
