import { ipcMain } from 'electron';
import { IPC } from '@ascua/ipc';
import type { IndexerService } from './indexer-service';

export function registerIndexerIpc(indexer: IndexerService): void {
  ipcMain.handle(IPC.indexProject, (_event, projectId: unknown) =>
    typeof projectId === 'string' ? indexer.index(projectId) : undefined,
  );
  ipcMain.handle(IPC.runBenchmark, (_event, projectId: unknown) =>
    typeof projectId === 'string'
      ? indexer.benchmark(projectId)
      : { code: 'indexer.notFound' },
  );
  ipcMain.handle(IPC.reindexProject, (_event, projectId: unknown) =>
    typeof projectId === 'string' ? indexer.reindex(projectId) : undefined,
  );
}
