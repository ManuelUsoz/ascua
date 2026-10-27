import type { Grammar } from '../parser-util';
import type { Definition, DefinitionKind } from '../query-util';

export type SymbolKind = DefinitionKind;
export type Language = Grammar;

export interface FileRow {
  id: number;
  path: string;
  content_hash: string;
  language: string;
}

export interface SymbolRow {
  id: number;
  file_id: number;
  name: string;
  kind: string;
  start_line: number;
  end_line: number;
  signature: string | null;
  owner: string | null;
}

export interface NewFile {
  /** Repo-relative, forward slashes. */
  readonly path: string;
  /** sha256 hex; an unchanged hash means skip re-parsing. */
  readonly contentHash: string;
  readonly language: Language;
}

export interface IndexedFile extends NewFile {
  readonly id: number;
}

export interface NewSymbol {
  readonly fileId: number;
  readonly name: string;
  readonly kind: SymbolKind;
  /** 1-based, inclusive. */
  readonly startLine: number;
  readonly endLine: number;
  readonly signature?: string;
  /** Enclosing class for methods. */
  readonly owner?: string;
}

export interface IndexedSymbol extends NewSymbol {
  readonly id: number;
}

export const fileFromRow = (row: FileRow): IndexedFile => ({
  id: row.id,
  path: row.path,
  contentHash: row.content_hash,
  language: row.language as Language,
});

export const symbolFromRow = (row: SymbolRow): IndexedSymbol => ({
  id: row.id,
  fileId: row.file_id,
  name: row.name,
  kind: row.kind as SymbolKind,
  startLine: row.start_line,
  endLine: row.end_line,
  ...(row.signature !== null && { signature: row.signature }),
  ...(row.owner !== null && { owner: row.owner }),
});

export const symbolFromDefinition = (
  fileId: number,
  definition: Definition,
  owner?: string,
): NewSymbol => ({
  fileId,
  name: definition.name,
  kind: definition.kind,
  startLine: definition.startLine,
  endLine: definition.endLine,
  ...(owner !== undefined && { owner }),
});
