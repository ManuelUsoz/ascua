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

export interface ImportRow {
  id: number;
  file_id: number;
  kind: string;
  local_name: string | null;
  imported_name: string | null;
  specifier: string;
  target_path: string | null;
  target_module: string | null;
  line: number;
}

export interface OccurrenceRow {
  id: number;
  file_id: number;
  name: string;
  qualifier: string | null;
  role: string;
  line: number;
  col: number;
  enclosing_symbol_id: number | null;
  binding: string | null;
  receiver_type: string | null;
}

export interface RelationRow {
  id: number;
  file_id: number;
  symbol_id: number;
  kind: string;
  target_name: string;
  target_qualifier: string | null;
}

export interface ToolCallRow {
  id: number;
  tool: string;
  started_at: number;
  duration_ms: number;
  tokens: number;
  max_tokens: number | null;
  results: number | null;
  ok: number;
  error: string | null;
}

/** Aggregate per tool; tool='*' is the overall row. */
export interface ToolCallTotals {
  readonly tool: string;
  readonly calls: number;
  readonly tokens: number;
  readonly avgMs: number;
  readonly maxMs: number;
  readonly errors: number;
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
