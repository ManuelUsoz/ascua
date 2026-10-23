import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '@ascua/ipc';
import type { ProjectRepository } from '../projects/project-repository';
import { FileAccessError, ProjectFiles } from './project-files';

describe('ProjectFiles', () => {
  let base: string;
  let root: string;
  let outside: string;

  const repository = (): ProjectRepository =>
    ({
      get: async (id: string) =>
        id === 'p'
          ? ({ id: 'p', name: 'p', path: root, terminals: [] } as Project)
          : undefined,
    }) as unknown as ProjectRepository;

  const make = (limits?: { indexCap: number; readCap: number; sniff: number }) =>
    new ProjectFiles(repository(), limits);

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'ascua-files-'));
    root = join(base, 'proj');
    outside = join(base, 'outside');
    mkdirSync(join(root, '.git'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(root, 'dist'));
    mkdirSync(join(root, 'web', 'src'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(root, '.git', 'HEAD'), 'ref');
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'x');
    writeFileSync(join(root, 'dist', 'out.js'), 'x');
    writeFileSync(join(root, 'README.md'), '# demo\n');
    writeFileSync(join(root, 'web', 'index.ts'), 'a');
    writeFileSync(join(root, 'web', 'src', 'app.ts'), 'b');
    writeFileSync(join(outside, 'secret.txt'), 'secret');
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('lists dirs first, hides .git and shows node_modules and dist', async () => {
    const entries = await make().list('p', '');
    expect(entries.map((e) => e.name)).toEqual([
      'dist',
      'node_modules',
      'web',
      'README.md',
    ]);
    expect(entries.every((e) => e.dir === (e.name !== 'README.md'))).toBe(true);
    const web = await make().list('p', 'web');
    expect(web.map((e) => e.path)).toEqual(['web/src', 'web/index.ts']);
  });

  it('rejects paths outside the project', async () => {
    const files = make();
    await expect(files.list('p', '../outside')).rejects.toBeInstanceOf(
      FileAccessError,
    );
    await expect(files.read('p', '../outside/secret.txt')).rejects.toThrow(
      'fuera del proyecto',
    );
    await expect(files.read('p', join(outside, 'secret.txt'))).rejects.toThrow(
      'fuera del proyecto',
    );
    await expect(files.resolve('p', 42 as unknown as string)).rejects.toThrow(
      'fuera del proyecto',
    );
  });

  it('rejects a junction that escapes the project', async () => {
    symlinkSync(outside, join(root, 'link'), 'junction');
    const files = make();
    await expect(files.list('p', 'link')).rejects.toBeInstanceOf(
      FileAccessError,
    );
    await expect(files.read('p', 'link/secret.txt')).rejects.toBeInstanceOf(
      FileAccessError,
    );
  });

  it('fails for an unknown project', async () => {
    await expect(make().list('nope', '')).rejects.toThrow('No existe el proyecto.');
  });

  it('indexes without .git, node_modules and dist', async () => {
    const index = await make().index('p');
    expect(index.truncated).toBe(false);
    expect([...index.files].sort()).toEqual([
      'README.md',
      'web/index.ts',
      'web/src/app.ts',
    ]);
  });

  it('truncates the index at the cap', async () => {
    const index = await make({ indexCap: 2, readCap: 1024, sniff: 100 }).index('p');
    expect(index.files).toHaveLength(2);
    expect(index.truncated).toBe(true);
  });

  it('reads text, binary and too-large files', async () => {
    writeFileSync(join(root, 'logo.bin'), Buffer.from([1, 0, 2]));
    writeFileSync(join(root, 'big.txt'), 'x'.repeat(50));
    const files = make({ indexCap: 10, readCap: 20, sniff: 100 });
    const readme = await files.read('p', 'README.md');
    expect(readme).toMatchObject({
      kind: 'text',
      text: '# demo\n',
      size: 7,
      openable: true,
    });
    expect(readme).toHaveProperty('version', expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(await files.read('p', 'README.md')).toEqual(readme);
    expect(await files.read('p', 'logo.bin')).toEqual({ kind: 'binary', size: 3 });
    expect(await files.read('p', 'big.txt')).toEqual({
      kind: 'too-large',
      size: 50,
    });
  });

  it('marks launchable files as not openable', async () => {
    writeFileSync(join(root, 'run.cmd'), '@echo off\n');
    const read = await make().read('p', 'run.cmd');
    expect(read).toMatchObject({ kind: 'text', openable: false });
    expect(await make().externalAction('p', 'run.cmd')).toMatchObject({
      openable: false,
    });
    expect(await make().externalAction('p', 'README.md')).toMatchObject({
      openable: true,
    });
    writeFileSync(join(root, 'logo.bin'), Buffer.from([1, 0, 2]));
    expect(await make().externalAction('p', 'logo.bin')).toMatchObject({
      openable: false,
    });
  });

  it('opens non-UTF-8 files read-only and refuses to save them', async () => {
    writeFileSync(join(root, 'latin.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
    const read = await make().read('p', 'latin.txt');
    expect(read).toMatchObject({ kind: 'text', editable: false });
    await expect(make().write('p', 'latin.txt', 'cafe')).rejects.toThrow(
      'no está en UTF-8',
    );
  });

  it('keeps a UTF-8 BOM editable and preserved on save', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    writeFileSync(join(root, 'bom.txt'), bom);
    const read = await make().read('p', 'bom.txt');
    if (read.kind !== 'text') throw new Error('not text');
    expect(read.editable).toBe(true);
    await make().write('p', 'bom.txt', `${read.text}!`, read.version);
    expect(readFileSync(join(root, 'bom.txt'))).toEqual(
      Buffer.concat([bom, Buffer.from('!')]),
    );
  });

  describe('write', () => {
    const versionOf = async (path: string): Promise<string> => {
      const content = await make().read('p', path);
      if (content.kind !== 'text') throw new Error('not text');
      return content.version;
    };

    it('saves and returns a new version', async () => {
      const files = make();
      const before = await versionOf('README.md');
      const result = await files.write('p', 'README.md', '# changed\n', before);
      expect(result).toMatchObject({ ok: true, size: 10 });
      expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('# changed\n');
      expect(result).toEqual({
        ok: true,
        version: await versionOf('README.md'),
        size: 10,
      });
      expect(await versionOf('README.md')).not.toBe(before);
    });

    it('reports a conflict after an external change', async () => {
      const before = await versionOf('README.md');
      writeFileSync(join(root, 'README.md'), 'external\n');
      expect(await make().write('p', 'README.md', 'mine\n', before)).toEqual({
        ok: false,
        conflict: true,
      });
      expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('external\n');
    });

    it('overwrites without a version', async () => {
      writeFileSync(join(root, 'README.md'), 'external\n');
      const result = await make().write('p', 'README.md', 'mine\n');
      expect(result).toMatchObject({ ok: true });
      expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('mine\n');
    });

    it('refuses paths outside the project', async () => {
      const files = make();
      await expect(files.write('p', '../outside/secret.txt', 'x')).rejects.toBeInstanceOf(
        FileAccessError,
      );
      symlinkSync(outside, join(root, 'link'), 'junction');
      await expect(files.write('p', 'link/secret.txt', 'x')).rejects.toBeInstanceOf(
        FileAccessError,
      );
      expect(readFileSync(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
    });

    it('refuses directories and text over the cap', async () => {
      const files = make({ indexCap: 10, readCap: 20, sniff: 100 });
      await expect(files.write('p', 'web', 'x')).rejects.toBeInstanceOf(
        FileAccessError,
      );
      await expect(
        files.write('p', 'README.md', 'x'.repeat(21)),
      ).rejects.toBeInstanceOf(FileAccessError);
      expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('# demo\n');
    });
  });
});
