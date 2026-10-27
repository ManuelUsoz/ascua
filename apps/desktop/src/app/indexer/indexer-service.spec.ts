import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { IndexProgress } from '@ascua/ipc';

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }));

import { IndexerService, indexerEntry } from './indexer-service';
import type { ForkIndexer } from './indexer-service';

const userData = join(tmpdir(), 'ascua-indexer-spec');

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  kill = vi.fn();
}

function setup() {
  const child = new FakeChild();
  const fork = vi.fn(() => child);
  const events: IndexProgress[] = [];
  const service = new IndexerService({
    projects: {
      get: async (id) =>
        id === 'p1'
          ? { id, name: 'p', path: '/root', terminals: [] }
          : undefined,
    },
    push: (e) => events.push(e),
    isPackaged: false,
    resourcesPath: '/res',
    userDataPath: userData,
    devRoot: '/app',
    fork: fork as unknown as ForkIndexer,
  });
  return { child, fork, events, service };
}

describe('IndexerService', () => {
  it('maps progress lines and exit 0 to events', async () => {
    const { child, fork, events, service } = setup();
    await service.index('p1');
    expect(fork).toHaveBeenCalledWith(
      join('/app', 'dist', 'apps', 'indexer', 'main.mjs'),
      ['index', '/root', '--db', join(userData, 'indexes', 'p1.db')],
    );
    child.stdout.emit('data', Buffer.from('{"done":1,"total":2}\n{"do'));
    child.stdout.emit('data', Buffer.from('ne":2,"total":2}\n'));
    child.emit('exit', 0);
    expect(events.map((e) => [e.state, e.done, e.total])).toEqual([
      ['running', 0, 0],
      ['running', 1, 2],
      ['running', 2, 2],
      ['done', 2, 2],
    ]);
  });

  it('reports an error on non-zero exit', async () => {
    const { child, events, service } = setup();
    await service.index('p1');
    child.emit('exit', 1);
    expect(events.at(-1)).toMatchObject({
      state: 'error',
      error: { code: 'indexer.failed' },
    });
  });

  it('reports an error when fork throws', async () => {
    const { fork, events, service } = setup();
    fork.mockImplementation(() => {
      throw new Error('spawn failed');
    });
    await service.index('p1');
    expect(events.at(-1)).toMatchObject({
      state: 'error',
      error: { code: 'indexer.failed' },
    });
  });

  it('runs one process per project', async () => {
    const { fork, service } = setup();
    await service.index('p1');
    await service.index('p1');
    expect(fork).toHaveBeenCalledTimes(1);
  });

  it('reports notFound for an unknown project', async () => {
    const { events, service } = setup();
    expect(await service.index('nope')).toEqual({ code: 'indexer.notFound' });
    expect(events[0].state).toBe('error');
  });

  it('resolves the packaged path under resources', () => {
    expect(indexerEntry(true, '/res')).toBe(
      join('/res', 'indexer', 'main.mjs'),
    );
  });
});
