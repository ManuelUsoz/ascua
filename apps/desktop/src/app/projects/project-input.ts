import { isAbsolute, win32, posix } from 'node:path';
import type {
  AscuaError,
  ErrorCode,
  Project,
  ProjectInput,
  RepositoryRef,
  TerminalSpec,
  TerminalSpecInput,
} from '@ascua/ipc';
import { isProviderId } from '@ascua/source-control';

/** A rejected input: the renderer translates `error` (`errors.<code>`). */
export class ProjectInputError extends Error {
  readonly error: AscuaError;

  constructor(code: ErrorCode, params?: AscuaError['params']) {
    super(code);
    this.name = 'ProjectInputError';
    this.error = params ? { code, params } : { code };
  }
}

const COLOR = /^#[0-9a-fA-F]{6}$/;

function isAbsoluteAny(path: string): boolean {
  return isAbsolute(path) || win32.isAbsolute(path) || posix.isAbsolute(path);
}

/**
 * `picked` relative to `root`, '/'-separated; '' for the root itself.
 * `undefined` when `picked` is outside `root` (or on another drive).
 */
export function relativeCwd(
  root: string,
  picked: string,
  path: typeof win32 = process.platform === 'win32' ? win32 : posix,
): string | undefined {
  const rel = path.relative(root, picked);
  if (!rel) return '';
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return undefined;
  }
  return rel.split(path.sep).join('/');
}

function normalizeCwd(
  raw: string | undefined,
  terminal: string,
): string | undefined {
  const cwd = raw?.trim();
  if (!cwd) return undefined;
  if (isAbsoluteAny(cwd)) {
    throw new ProjectInputError('project.terminalCwdAbsolute', {
      name: terminal,
    });
  }
  const parts = cwd.split(/[\\/]+/).filter((part) => part && part !== '.');
  let depth = 0;
  for (const part of parts) {
    depth += part === '..' ? -1 : 1;
    if (depth < 0) {
      throw new ProjectInputError('project.terminalCwdOutside', {
        name: terminal,
      });
    }
  }
  return cwd;
}

function normalizePort(raw: unknown, terminal: string): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (
    typeof raw !== 'number' ||
    !Number.isInteger(raw) ||
    raw < 1 ||
    raw > 65535
  ) {
    throw new ProjectInputError('project.terminalPortInvalid', {
      name: terminal,
    });
  }
  return raw;
}

/** Project with the pista added, or replaced when `spec.id` already exists. */
export function withPista(
  project: Project,
  spec: TerminalSpecInput,
  newId: () => string,
): Project {
  if (!spec || typeof spec !== 'object') {
    throw new ProjectInputError('project.terminalInvalid');
  }
  const exists = !!spec.id && project.terminals.some((t) => t.id === spec.id);
  const terminals: TerminalSpecInput[] = exists
    ? project.terminals.map((t) => (t.id === spec.id ? spec : t))
    : [...project.terminals, spec];
  return normalizeProject({ ...project, terminals }, newId);
}

export function withoutPista(project: Project, terminalId: string): Project {
  return normalizeProject(
    {
      ...project,
      terminals: project.terminals.filter((t) => t.id !== terminalId),
    },
    () => {
      throw new ProjectInputError('project.idMissing');
    },
  );
}

export function normalizeProject(
  input: ProjectInput,
  newId: () => string,
): Project {
  if (!input || typeof input !== 'object') {
    throw new ProjectInputError('project.invalid');
  }
  const optionalString = (value: unknown) =>
    value === undefined || value === null || typeof value === 'string';
  if (
    !optionalString(input.id) ||
    !optionalString(input.name) ||
    !optionalString(input.path) ||
    !optionalString(input.color) ||
    (input.terminals !== undefined && !Array.isArray(input.terminals))
  ) {
    throw new ProjectInputError('project.invalid');
  }
  for (const terminal of input.terminals ?? []) {
    if (
      !terminal ||
      typeof terminal !== 'object' ||
      !optionalString(terminal.id) ||
      !optionalString(terminal.name) ||
      !optionalString(terminal.command) ||
      !optionalString(terminal.cwd)
    ) {
      throw new ProjectInputError('project.terminalInvalid');
    }
  }

  const name = input.name?.trim();
  if (!name) throw new ProjectInputError('project.nameRequired');

  const path = input.path?.trim();
  if (!path) throw new ProjectInputError('project.folderRequired');
  if (!isAbsoluteAny(path)) {
    throw new ProjectInputError('project.folderNotAbsolute');
  }

  const color = input.color?.trim();
  if (color && !COLOR.test(color)) {
    throw new ProjectInputError('project.invalidColor');
  }

  const terminals = (input.terminals ?? []).map((terminal): TerminalSpec => {
    const terminalName = terminal.name?.trim();
    if (!terminalName) {
      throw new ProjectInputError('project.terminalNameRequired');
    }
    const command = terminal.command?.trim();
    if (!command) {
      throw new ProjectInputError('project.terminalCommandRequired', {
        name: terminalName,
      });
    }
    const spec: TerminalSpec = {
      id: terminal.id?.trim() || newId(),
      name: terminalName,
      command,
    };
    const cwd = normalizeCwd(terminal.cwd, terminalName);
    if (cwd) spec.cwd = cwd;
    const port = normalizePort(terminal.port, terminalName);
    if (port !== undefined) spec.port = port;
    return spec;
  });

  const project: Project = {
    id: input.id?.trim() || newId(),
    name,
    path,
    terminals,
  };
  if (color) project.color = color;
  if (input.repository !== undefined && input.repository !== null) {
    const repository = parseRepository(input.repository);
    if (!repository) throw new ProjectInputError('project.repositoryInvalid');
    project.repository = repository;
  }
  return project;
}

function parseRepository(raw: unknown): RepositoryRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { provider, id, name, fullName } = raw as Record<string, unknown>;
  const filled = (value: unknown): value is string =>
    typeof value === 'string' && value.trim() !== '';
  if (
    !isProviderId(provider) ||
    !filled(id) ||
    !filled(name) ||
    !filled(fullName)
  ) {
    return undefined;
  }
  return { provider, id, name, fullName };
}
