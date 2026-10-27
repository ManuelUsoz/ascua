import { existsSync } from 'node:fs';
import type { McpServerSpec } from '@ascua/chat';
import { indexDbPath, indexerEntry } from './indexer-service';

export interface IndexerMcpOptions {
  isPackaged: boolean;
  resourcesPath: string;
  devRoot?: string;
  userDataPath: string;
  /** Electron binary; runs the indexer as plain node via ELECTRON_RUN_AS_NODE. */
  execPath: string;
  exists?: (path: string) => boolean;
}

/** Stdio MCP server spec for a project's index, or undefined when not indexed yet. */
export function indexerMcpSpec(
  options: IndexerMcpOptions,
  projectId: string,
  root: string,
): McpServerSpec | undefined {
  const exists = options.exists ?? existsSync;
  const entry = indexerEntry(
    options.isPackaged,
    options.resourcesPath,
    options.devRoot,
  );
  const db = indexDbPath(options.userDataPath, projectId);
  if (!exists(entry) || !exists(db)) return undefined;
  return {
    name: 'ascua-indexer',
    command: options.execPath,
    args: [entry, 'mcp', root, '--db', db],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}
