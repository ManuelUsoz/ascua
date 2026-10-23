import { describe, expect, it } from 'vitest';
import type { ProjectInput } from '@ascua/ipc';
import { win32, posix } from 'node:path';
import {
  normalizeProject,
  ProjectInputError,
  relativeCwd,
} from './project-input';

describe('relativeCwd', () => {
  it('maps folders inside a win32 project', () => {
    expect(relativeCwd('C:\\p', 'C:\\p', win32)).toBe('');
    expect(relativeCwd('C:\\p', 'C:\\p\\web\\src', win32)).toBe('web/src');
    expect(relativeCwd('c:\\p', 'C:\\p\\web', win32)).toBe('web');
  });

  it('rejects folders outside a win32 project', () => {
    expect(relativeCwd('C:\\p', 'C:\\', win32)).toBeUndefined();
    expect(relativeCwd('C:\\p', 'C:\\p2', win32)).toBeUndefined();
    expect(relativeCwd('C:\\p', 'D:\\p\\web', win32)).toBeUndefined();
  });

  it('maps and rejects on posix', () => {
    expect(relativeCwd('/p', '/p', posix)).toBe('');
    expect(relativeCwd('/p', '/p/web/src', posix)).toBe('web/src');
    expect(relativeCwd('/p', '/p2', posix)).toBeUndefined();
    expect(relativeCwd('/p', '/', posix)).toBeUndefined();
  });
});

const ROOT = process.platform === 'win32' ? 'C:\\work\\app' : '/work/app';

function ids() {
  let n = 0;
  return () => `id-${++n}`;
}

function input(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: '  Demo ',
    path: ` ${ROOT} `,
    terminals: [{ name: ' api ', command: ' ./mvnw spring-boot:run ', port: 8080 }],
    ...overrides,
  };
}

function reject(value: ProjectInput, message: RegExp) {
  expect(() => normalizeProject(value, ids())).toThrow(ProjectInputError);
  expect(() => normalizeProject(value, ids())).toThrow(message);
}

describe('normalizeProject', () => {
  it('rejects malformed payloads', () => {
    const bad = (value: unknown) => reject(value as ProjectInput, /inválidos/);
    bad(null);
    bad({ name: 5, path: ROOT });
    bad({ name: 'a', path: ROOT, terminals: 'x' });
    bad({ name: 'a', path: ROOT, terminals: [null] });
    bad({ name: 'a', path: ROOT, terminals: [{ name: 'a', command: 3 }] });
  });

  it('trims and normalizes valid input', () => {
    const project = normalizeProject(input({ color: '#aabbcc' }), ids());
    expect(project).toEqual({
      id: 'id-2',
      name: 'Demo',
      path: ROOT,
      color: '#aabbcc',
      terminals: [
        { id: 'id-1', name: 'api', command: './mvnw spring-boot:run', port: 8080 },
      ],
    });
  });

  it('requires a name and an absolute path', () => {
    reject(input({ name: '   ' }), /nombre/);
    reject(input({ path: '' }), /carpeta/);
    reject(input({ path: 'relative/dir' }), /absoluta/);
  });

  it('requires name and command per terminal', () => {
    reject(input({ terminals: [{ name: '', command: 'x' }] }), /nombre/);
    reject(input({ terminals: [{ name: 'a', command: ' ' }] }), /comando/);
  });

  it('rejects absolute or escaping cwd and accepts nested ones', () => {
    const term = (cwd: string) => input({ terminals: [{ name: 'a', command: 'x', cwd }] });
    reject(term(ROOT), /relativa/);
    reject(term('../other'), /salir/);
    reject(term('a/../../b'), /salir/);
    const ok = normalizeProject(term('sub/../web'), ids());
    expect(ok.terminals[0].cwd).toBe('sub/../web');
  });

  it('rejects invalid ports', () => {
    for (const port of [0, 70000, 1.5, Number.NaN]) {
      reject(input({ terminals: [{ name: 'a', command: 'x', port }] }), /puerto/);
    }
  });

  it('rejects invalid colors', () => {
    reject(input({ color: 'red' }), /color/);
    reject(input({ color: '#abc' }), /color/);
  });

  it('keeps existing ids and assigns new ones', () => {
    const project = normalizeProject(
      input({
        id: 'proj',
        terminals: [
          { id: 'keep', name: 'a', command: 'x' },
          { name: 'b', command: 'y' },
        ],
      }),
      ids(),
    );
    expect(project.id).toBe('proj');
    expect(project.terminals.map((t) => t.id)).toEqual(['keep', 'id-1']);
  });
});
