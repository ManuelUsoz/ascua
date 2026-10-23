import { isAbsolute, win32, posix } from 'node:path';
import type { Project, ProjectInput, TerminalSpec } from '@ascua/ipc';

export class ProjectInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectInputError';
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

function normalizeCwd(raw: string | undefined, terminal: string): string | undefined {
  const cwd = raw?.trim();
  if (!cwd) return undefined;
  if (isAbsoluteAny(cwd)) {
    throw new ProjectInputError(
      `La carpeta de "${terminal}" debe ser relativa al proyecto.`,
    );
  }
  const parts = cwd.split(/[\\/]+/).filter((part) => part && part !== '.');
  let depth = 0;
  for (const part of parts) {
    depth += part === '..' ? -1 : 1;
    if (depth < 0) {
      throw new ProjectInputError(
        `La carpeta de "${terminal}" no puede salir del proyecto.`,
      );
    }
  }
  return cwd;
}

function normalizePort(raw: unknown, terminal: string): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 65535) {
    throw new ProjectInputError(
      `El puerto de "${terminal}" debe ser un entero entre 1 y 65535.`,
    );
  }
  return raw;
}

export function normalizeProject(
  input: ProjectInput,
  newId: () => string,
): Project {
  if (!input || typeof input !== 'object') {
    throw new ProjectInputError('Datos de proyecto inválidos.');
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
    throw new ProjectInputError('Datos de proyecto inválidos.');
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
      throw new ProjectInputError('Datos de terminal inválidos.');
    }
  }

  const name = input.name?.trim();
  if (!name) throw new ProjectInputError('El proyecto necesita un nombre.');

  const path = input.path?.trim();
  if (!path) throw new ProjectInputError('El proyecto necesita una carpeta.');
  if (!isAbsoluteAny(path)) {
    throw new ProjectInputError('La carpeta del proyecto debe ser absoluta.');
  }

  const color = input.color?.trim();
  if (color && !COLOR.test(color)) {
    throw new ProjectInputError('El color debe tener el formato #rrggbb.');
  }

  const terminals = (input.terminals ?? []).map((terminal): TerminalSpec => {
    const terminalName = terminal.name?.trim();
    if (!terminalName) {
      throw new ProjectInputError('Cada terminal necesita un nombre.');
    }
    const command = terminal.command?.trim();
    if (!command) {
      throw new ProjectInputError(`"${terminalName}" necesita un comando.`);
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
  return project;
}
