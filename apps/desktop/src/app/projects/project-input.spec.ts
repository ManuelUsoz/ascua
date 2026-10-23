import { describe, expect, it } from 'vitest';
import type { ProjectInput, TerminalSpecInput } from '@ascua/ipc';
import { win32, posix } from 'node:path';
import {
  normalizeProject,
  ProjectInputError,
  relativeCwd,
  withoutPista,
  withPista,
} from './project-input';

describe('withPista / withoutPista', () => {
  const base = {
    id: 'p',
    name: 'P',
    path: '/p',
    terminals: [{ id: 't1', name: 'api', command: 'run' }],
  };
  const newId = () => 'new';

  it('adds a pista with a generated id', () => {
    const next = withPista(base, { name: 'web', command: 'dev' }, newId);
    expect(next.terminals.map((t) => t.id)).toEqual(['t1', 'new']);
  });

  it('replaces the pista with the same id', () => {
    const next = withPista(
      base,
      { id: 't1', name: 'api2', command: 'run2', port: 80 },
      newId,
    );
    expect(next.terminals).toEqual([
      { id: 't1', name: 'api2', command: 'run2', port: 80 },
    ]);
  });

  it('rejects an invalid pista', () => {
    expect(() => withPista(base, { name: '', command: 'x' }, newId)).toThrow(
      ProjectInputError,
    );
  });

  it('rejects a missing pista spec', () => {
    for (const bad of [undefined, null]) {
      expect(() =>
        withPista(base, bad as unknown as TerminalSpecInput, newId),
      ).toThrow(ProjectInputError);
    }
  });

  it('removes a pista', () => {
    expect(withoutPista(base, 't1').terminals).toEqual([]);
    expect(withoutPista(base, 'zzz').terminals).toHaveLength(1);
  });
});

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
    terminals: [
      { name: ' api ', command: ' ./mvnw spring-boot:run ', port: 8080 },
    ],
    ...overrides,
  };
}

function reject(
  value: ProjectInput,
  code: string,
  params?: Record<string, string>,
) {
  expect(() => normalizeProject(value, ids())).toThrow(ProjectInputError);
  try {
    normalizeProject(value, ids());
  } catch (error) {
    expect((error as ProjectInputError).error).toEqual(
      params ? { code, params } : { code },
    );
  }
}

describe('normalizeProject', () => {
  it('rejects malformed payloads', () => {
    const bad = (value: unknown) =>
      reject(value as ProjectInput, 'project.invalid');
    const badTerminal = (value: unknown) =>
      reject(value as ProjectInput, 'project.terminalInvalid');
    bad(null);
    bad({ name: 5, path: ROOT });
    bad({ name: 'a', path: ROOT, terminals: 'x' });
    badTerminal({ name: 'a', path: ROOT, terminals: [null] });
    badTerminal({
      name: 'a',
      path: ROOT,
      terminals: [{ name: 'a', command: 3 }],
    });
  });

  it('trims and normalizes valid input', () => {
    const project = normalizeProject(input({ color: '#aabbcc' }), ids());
    expect(project).toEqual({
      id: 'id-2',
      name: 'Demo',
      path: ROOT,
      color: '#aabbcc',
      terminals: [
        {
          id: 'id-1',
          name: 'api',
          command: './mvnw spring-boot:run',
          port: 8080,
        },
      ],
    });
  });

  it('requires a name and an absolute path', () => {
    reject(input({ name: '   ' }), 'project.nameRequired');
    reject(input({ path: '' }), 'project.folderRequired');
    reject(input({ path: 'relative/dir' }), 'project.folderNotAbsolute');
  });

  it('requires name and command per terminal', () => {
    reject(
      input({ terminals: [{ name: '', command: 'x' }] }),
      'project.terminalNameRequired',
    );
    reject(
      input({ terminals: [{ name: 'a', command: ' ' }] }),
      'project.terminalCommandRequired',
      { name: 'a' },
    );
  });

  it('rejects absolute or escaping cwd and accepts nested ones', () => {
    const term = (cwd: string) =>
      input({ terminals: [{ name: 'a', command: 'x', cwd }] });
    const named = { name: 'a' };
    reject(term(ROOT), 'project.terminalCwdAbsolute', named);
    reject(term('../other'), 'project.terminalCwdOutside', named);
    reject(term('a/../../b'), 'project.terminalCwdOutside', named);
    const ok = normalizeProject(term('sub/../web'), ids());
    expect(ok.terminals[0].cwd).toBe('sub/../web');
  });

  it('rejects invalid ports', () => {
    for (const port of [0, 70000, 1.5, Number.NaN]) {
      reject(
        input({ terminals: [{ name: 'a', command: 'x', port }] }),
        'project.terminalPortInvalid',
        { name: 'a' },
      );
    }
  });

  it('rejects invalid colors', () => {
    reject(input({ color: 'red' }), 'project.invalidColor');
    reject(input({ color: '#abc' }), 'project.invalidColor');
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
