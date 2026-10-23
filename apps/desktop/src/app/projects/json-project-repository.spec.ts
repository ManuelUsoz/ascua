import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@ascua/ipc';
import { JsonProjectRepository } from './json-project-repository';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ascua-projects-'));
  file = join(dir, 'projects.json');
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function project(id: string, name = id): Project {
  return {
    id,
    name,
    path: dir,
    terminals: [{ id: `${id}-t`, name: 'api', command: 'x', port: 8080 }],
  };
}

describe('JsonProjectRepository.update', () => {
  it('lands two concurrent updates and persists them', async () => {
    const repo = new JsonProjectRepository(file);
    await repo.save(project('a'));
    const add =
      (name: string) =>
      (p: Project): Project => ({
        ...p,
        terminals: [...p.terminals, { id: name, name, command: 'x' }],
      });
    await Promise.all([
      repo.update('a', add('one')),
      repo.update('a', add('two')),
    ]);

    const again = new JsonProjectRepository(file);
    expect((await again.get('a'))?.terminals.map((t) => t.id)).toEqual([
      'a-t',
      'one',
      'two',
    ]);
  });

  it('returns undefined for an unknown project', async () => {
    const repo = new JsonProjectRepository(file);
    expect(await repo.update('nope', (p) => p)).toBeUndefined();
  });
});

describe('JsonProjectRepository', () => {
  it('starts empty and round-trips through a fresh instance', async () => {
    const repo = new JsonProjectRepository(file);
    expect(await repo.list()).toEqual([]);
    await repo.save(project('a'));
    await repo.save(project('b'));

    const again = new JsonProjectRepository(file);
    expect((await again.list()).map((p) => p.id)).toEqual(['a', 'b']);
    expect(await again.get('a')).toEqual(project('a'));
    expect(await again.get('zzz')).toBeUndefined();
  });

  it('updates and removes', async () => {
    const repo = new JsonProjectRepository(file);
    await repo.save(project('a'));
    await repo.save(project('a', 'renamed'));
    expect(await repo.list()).toHaveLength(1);
    expect((await repo.get('a'))?.name).toBe('renamed');

    await repo.remove('a');
    await repo.remove('missing');
    expect(await new JsonProjectRepository(file).list()).toEqual([]);
  });

  it('leaves no .tmp file behind, even with concurrent saves', async () => {
    const repo = new JsonProjectRepository(file);
    await Promise.all([
      repo.save(project('a')),
      repo.save(project('b')),
      repo.remove('a'),
    ]);
    expect(readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual(
      [],
    );
    expect(
      (await new JsonProjectRepository(file).list()).map((p) => p.id),
    ).toEqual(['b']);
  });

  it('leaves the cache unchanged when persist fails', async () => {
    const repo = new JsonProjectRepository(file);
    await repo.save(project('a'));
    // a directory at the tmp path makes writeFile fail
    mkdirSync(`${file}.tmp`);
    await expect(repo.save(project('b'))).rejects.toThrow();
    await expect(repo.remove('a')).rejects.toThrow();
    expect((await repo.list()).map((p) => p.id)).toEqual(['a']);
  });

  it('retries a rejected read on the next call', async () => {
    mkdirSync(file); // readFile fails with EISDIR
    const repo = new JsonProjectRepository(file);
    await expect(repo.list()).rejects.toThrow();
    rmSync(file, { recursive: true });
    expect(await repo.list()).toEqual([]);
  });

  it('skips invalid stored entries without rewriting the file', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raw = JSON.stringify({
      version: 1,
      projects: [
        project('a'),
        { id: 'bad', name: 5 },
        null,
        { name: 'noid', path: dir },
      ],
    });
    writeFileSync(file, raw);
    const repo = new JsonProjectRepository(file);
    expect((await repo.list()).map((p) => p.id)).toEqual(['a']);
    expect(readFileSync(file, 'utf8')).toBe(raw);
  });

  it('keeps a corrupt file aside and starts empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    writeFileSync(file, '{ not json');
    const repo = new JsonProjectRepository(file);
    expect(await repo.list()).toEqual([]);
    expect(
      readdirSync(dir).some((name) =>
        name.startsWith('projects.json.corrupt-'),
      ),
    ).toBe(true);
    await repo.save(project('a'));
    expect(
      (await new JsonProjectRepository(file).list()).map((p) => p.id),
    ).toEqual(['a']);
  });
});
