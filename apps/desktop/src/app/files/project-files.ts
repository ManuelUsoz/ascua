import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type {
  AscuaError,
  ErrorCode,
  FileContent,
  FileEntry,
  FileIndex,
  SaveFileResult,
} from '@ascua/ipc';
import type { ProjectRepository } from '../projects/project-repository';
import { isOpenable } from './launch-policy';

const hash = (data: Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** Lossless UTF-8 round trip (a BOM survives as U+FEFF). */
const isUtf8 = (data: Buffer): boolean =>
  Buffer.from(data.toString('utf8'), 'utf8').equals(data);

/** A refused file operation; carries the code the renderer translates. */
export class FileAccessError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

/** The code for a failed file operation; never leaks raw fs messages. */
export function fileError(
  error: unknown,
  action: 'read' | 'write' = 'read',
): AscuaError {
  if (error instanceof FileAccessError) return { code: error.code };
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return { code: 'file.gone' };
  if (code === 'EACCES' || code === 'EPERM') {
    return {
      code: action === 'write' ? 'file.writeDenied' : 'file.readDenied',
    };
  }
  return { code: action === 'write' ? 'file.writeFailed' : 'file.readFailed' };
}

const SKIPPED_IN_INDEX = new Set(['.git', 'node_modules', 'dist']);

export interface FileLimits {
  indexCap: number;
  readCap: number;
  sniff: number;
}

const DEFAULT_LIMITS: FileLimits = {
  indexCap: 20000,
  readCap: 1024 * 1024,
  sniff: 8000,
};

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Resolve `rel` (project-relative, `''` = root) to an absolute path that stays
 * inside `root`, also after following symlinks and junctions.
 */
export async function resolveInside(
  root: string,
  rel: unknown,
): Promise<string> {
  if (typeof rel !== 'string' || isAbsolute(rel)) {
    throw new FileAccessError('file.outside');
  }
  const target = resolve(root, rel);
  if (!isInside(root, target)) throw new FileAccessError('file.outside');
  const [realRoot, realTarget] = await Promise.all([
    fs.realpath(root),
    fs.realpath(target),
  ]);
  if (!isInside(realRoot, realTarget))
    throw new FileAccessError('file.outside');
  return target;
}

function toRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

export class ProjectFiles {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly limits: FileLimits = DEFAULT_LIMITS,
  ) {}

  private async root(projectId: string): Promise<string> {
    const project = await this.repository.get(projectId);
    if (!project) throw new FileAccessError('project.notFound');
    return project.path;
  }

  /** Absolute path of a project file, checked to be inside the project. */
  async resolve(projectId: string, path: string): Promise<string> {
    return resolveInside(await this.root(projectId), path);
  }

  async list(projectId: string, dir: string): Promise<FileEntry[]> {
    const root = await this.root(projectId);
    const abs = await resolveInside(root, dir);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    return entries
      .filter((entry) => entry.name !== '.git')
      .map((entry) => ({
        name: entry.name,
        path: toRel(root, join(abs, entry.name)),
        dir: entry.isDirectory(),
      }))
      .sort(
        (a, b) =>
          Number(b.dir) - Number(a.dir) ||
          a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
  }

  async index(projectId: string): Promise<FileIndex> {
    const root = await this.root(projectId);
    const files: string[] = [];
    const pending = [root];
    while (pending.length > 0) {
      const dir = pending.pop() as string;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIPPED_IN_INDEX.has(entry.name)) {
            pending.push(join(dir, entry.name));
          }
        } else if (entry.isFile()) {
          if (files.length >= this.limits.indexCap) {
            return { files, truncated: true };
          }
          files.push(toRel(root, join(dir, entry.name)));
        }
      }
    }
    return { files, truncated: false };
  }

  async read(projectId: string, path: string): Promise<FileContent> {
    const abs = await this.resolve(projectId, path);
    const { size, mode } = await fs.stat(abs);
    if (size > this.limits.readCap) return { kind: 'too-large', size };
    const buffer = await fs.readFile(abs);
    if (buffer.subarray(0, this.limits.sniff).includes(0)) {
      return { kind: 'binary', size };
    }
    const text = buffer.toString('utf8');
    return {
      kind: 'text',
      text,
      size,
      version: hash(buffer),
      editable: isUtf8(buffer),
      openable: isOpenable(path, {
        binary: false,
        mode,
        platform: process.platform,
      }),
    };
  }

  /** Save `text` over an existing file; conflict when `version` is stale. */
  async write(
    projectId: string,
    path: string,
    text: string,
    version?: string,
  ): Promise<SaveFileResult> {
    const abs = await this.resolve(projectId, path);
    if (typeof text !== 'string') throw new FileAccessError('file.invalidText');
    const stat = await fs.stat(abs);
    if (!stat.isFile()) throw new FileAccessError('file.notAFile');
    if (Buffer.byteLength(text) > this.limits.readCap) {
      throw new FileAccessError('file.tooLargeToSave');
    }
    const current = await fs.readFile(abs);
    if (!isUtf8(current)) throw new FileAccessError('file.notUtf8');
    if (version !== undefined && hash(current) !== version) {
      return { ok: false, conflict: true };
    }
    const data = Buffer.from(text, 'utf8');
    await fs.writeFile(abs, data);
    return { ok: true, version: hash(data), size: data.length };
  }

  /** Absolute path plus whether the default app may open it safely. */
  async externalAction(
    projectId: string,
    path: string,
  ): Promise<{ abs: string; openable: boolean }> {
    const abs = await this.resolve(projectId, path);
    const { mode, size } = await fs.stat(abs);
    let binary = false;
    if (size > 0) {
      const handle = await fs.open(abs, 'r');
      try {
        const head = Buffer.alloc(Math.min(size, this.limits.sniff));
        const { bytesRead } = await handle.read(head, 0, head.length, 0);
        binary = head.subarray(0, bytesRead).includes(0);
      } finally {
        await handle.close();
      }
    }
    return {
      abs,
      openable: isOpenable(path, { binary, mode, platform: process.platform }),
    };
  }
}
