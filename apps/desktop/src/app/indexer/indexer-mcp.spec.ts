import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { indexerMcpSpec } from './indexer-mcp';

const base = {
  isPackaged: false,
  resourcesPath: join('res'),
  devRoot: join('repo'),
  userDataPath: join('data'),
  execPath: 'electron',
  exists: () => true,
};

describe('indexerMcpSpec', () => {
  it('builds the dev spec', () => {
    expect(indexerMcpSpec(base, 'p1', 'root')).toEqual({
      name: 'ascua-indexer',
      command: 'electron',
      args: [
        join('repo', 'dist', 'apps', 'indexer', 'main.mjs'),
        'mcp',
        'root',
        '--db',
        join('data', 'indexes', 'p1.db'),
      ],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });

  it('uses the packaged entry', () => {
    const spec = indexerMcpSpec({ ...base, isPackaged: true }, 'p1', 'root');
    expect(spec?.args[0]).toBe(join('res', 'indexer', 'main.mjs'));
  });

  it('is undefined when the db is missing', () => {
    const exists = (p: string) => !p.endsWith('.db');
    expect(indexerMcpSpec({ ...base, exists }, 'p1', 'root')).toBeUndefined();
  });

  it('is undefined when the entry is missing', () => {
    const exists = (p: string) => !p.endsWith('main.mjs');
    expect(indexerMcpSpec({ ...base, exists }, 'p1', 'root')).toBeUndefined();
  });
});
