import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type {
  ErrorCode,
  NoteContent,
  NoteRenameResult,
  NoteSummary,
  SaveFileResult,
} from '@ascua/ipc';
import {
  noteKey,
  noteNameError,
  parseOutline,
  renameNoteLinks,
} from '@ascua/notes';
import { FileAccessError, resolveInside } from '../files/project-files';
import { writeTextAtomic } from '../storage/atomic-json';

const NOTE_MAX_BYTES = 1024 * 1024;
const EXT = '.md';

const hash = (data: Buffer): string =>
  createHash('sha256').update(data).digest('hex');

/** A refused note operation; carries the code the renderer translates. */
export class NoteAccessError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

function checkedName(name: unknown): string {
  if (typeof name !== 'string') throw new NoteAccessError('note.nameInvalid');
  const error = noteNameError(name);
  if (error) throw new NoteAccessError(error);
  return name.trim();
}

export class NoteStore {
  constructor(
    readonly dir: string,
    private readonly trash: (abs: string) => Promise<void>,
  ) {}

  /** Absolute path of an existing note, checked to be inside the folder. */
  private async existing(name: unknown): Promise<string> {
    const clean = checkedName(name);
    try {
      return await resolveInside(this.dir, `${clean}${EXT}`);
    } catch (error) {
      if (error instanceof FileAccessError) {
        throw new NoteAccessError('note.nameInvalid');
      }
      throw error;
    }
  }

  async list(): Promise<NoteSummary[]> {
    let entries;
    try {
      entries = await fs.readdir(this.dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const notes: NoteSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(EXT)) continue;
      const name = entry.name.slice(0, -EXT.length);
      if (noteNameError(name)) continue;
      const abs = join(this.dir, entry.name);
      try {
        const stat = await fs.stat(abs);
        if (stat.size > NOTE_MAX_BYTES) continue;
        const outline = parseOutline(await fs.readFile(abs, 'utf8'));
        const seen = new Set<string>();
        const links: string[] = [];
        for (const link of outline.links) {
          const key = noteKey(link.note);
          if (seen.has(key)) continue;
          seen.add(key);
          links.push(link.note);
        }
        notes.push({
          name,
          headings: outline.headings,
          links,
          updatedAt: stat.mtimeMs,
        });
      } catch {
        // Unreadable file: leave it out of the list.
      }
    }
    return notes.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
  }

  async read(name: string): Promise<NoteContent> {
    const abs = await this.existing(name);
    const { size } = await fs.stat(abs);
    if (size > NOTE_MAX_BYTES) throw new NoteAccessError('note.tooLarge');
    const buffer = await fs.readFile(abs);
    return {
      name: checkedName(name),
      text: buffer.toString('utf8'),
      version: hash(buffer),
    };
  }

  async create(name: string, text?: string): Promise<NoteContent> {
    const clean = checkedName(name);
    const body = text ?? `# ${clean}\n`;
    if (typeof body !== 'string') throw new NoteAccessError('note.saveFailed');
    if (Buffer.byteLength(body) > NOTE_MAX_BYTES) {
      throw new NoteAccessError('note.tooLarge');
    }
    await fs.mkdir(this.dir, { recursive: true });
    const taken = (await fs.readdir(this.dir)).some(
      (file) =>
        file.toLowerCase().endsWith(EXT) &&
        noteKey(file.slice(0, -EXT.length)) === noteKey(clean),
    );
    if (taken) throw new NoteAccessError('note.exists');
    const data = Buffer.from(body, 'utf8');
    try {
      await fs.writeFile(join(this.dir, `${clean}${EXT}`), data, {
        flag: 'wx',
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NoteAccessError('note.exists');
      }
      throw error;
    }
    return { name: clean, text: body, version: hash(data) };
  }

  /** Save `text` over an existing note; conflict when `version` is stale. */
  async save(
    name: string,
    text: string,
    version?: string,
  ): Promise<SaveFileResult> {
    const abs = await this.existing(name);
    if (typeof text !== 'string') throw new NoteAccessError('note.saveFailed');
    if (Buffer.byteLength(text) > NOTE_MAX_BYTES) {
      throw new NoteAccessError('note.tooLarge');
    }
    const current = await fs.readFile(abs);
    if (version !== undefined && hash(current) !== version) {
      return { ok: false, conflict: true };
    }
    const data = Buffer.from(text, 'utf8');
    await writeTextAtomic(abs, text);
    return { ok: true, version: hash(data), size: data.length };
  }

  /**
   * Renames a note (case-only changes included) and rewrites the `[[links]]`
   * to it in every note. Link rewriting is best effort: the rename stands.
   */
  async rename(from: string, to: string): Promise<NoteRenameResult> {
    const fromAbs = await this.existing(from);
    const oldName = checkedName(from);
    const newName = checkedName(to);
    if (oldName === newName) return { name: newName, updatedNotes: 0 };

    const sameNote = noteKey(oldName) === noteKey(newName);
    const entries = await fs.readdir(this.dir);
    const isNote = (file: string): boolean => file.toLowerCase().endsWith(EXT);
    const keyOf = (file: string): string => noteKey(file.slice(0, -EXT.length));
    // The file on disk may differ in case from the caller's `from`.
    const diskFile =
      entries.find((file) => file === `${oldName}${EXT}`) ??
      entries.find(
        (file) => isNote(file) && keyOf(file) === noteKey(oldName),
      ) ??
      `${oldName}${EXT}`;
    const taken = entries.some(
      (file) =>
        isNote(file) && file !== diskFile && keyOf(file) === noteKey(newName),
    );
    if (taken) throw new NoteAccessError('note.exists');
    const diskName = diskFile.slice(0, -EXT.length);

    const toAbs = join(this.dir, `${newName}${EXT}`);
    if (sameNote) {
      // Via a temp name so case-insensitive file systems see a real move.
      const temp = join(this.dir, `${diskName}.${randomUUID()}.renaming`);
      await fs.rename(fromAbs, temp);
      try {
        await fs.rename(temp, toAbs);
      } catch (error) {
        await fs.rename(temp, fromAbs).catch(() => undefined);
        throw error;
      }
    } else {
      try {
        await fs.lstat(toAbs);
        throw new NoteAccessError('note.exists');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await fs.rename(fromAbs, toAbs);
    }

    let updatedNotes = 0;
    for (const file of await fs.readdir(this.dir)) {
      if (!file.toLowerCase().endsWith(EXT)) continue;
      const name = file.slice(0, -EXT.length);
      if (noteNameError(name)) continue;
      const abs = join(this.dir, file);
      try {
        const stat = await fs.stat(abs);
        if (!stat.isFile() || stat.size > NOTE_MAX_BYTES) continue;
        const result = renameNoteLinks(
          await fs.readFile(abs, 'utf8'),
          oldName,
          newName,
        );
        if (result.count === 0) continue;
        await writeTextAtomic(abs, result.text);
        if (file !== `${newName}${EXT}`) updatedNotes++;
      } catch {
        // Best effort: this note keeps its old links.
      }
    }
    return { name: newName, updatedNotes };
  }

  /** Moves the note to the OS trash, so it can be restored. */
  async remove(name: string): Promise<void> {
    await this.trash(await this.existing(name));
  }
}
