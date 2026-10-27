import { ipcMain } from 'electron';
import { IPC } from '@ascua/ipc';
import type { IndexerService } from './indexer-service';

export function registerIndexerIpc(indexer: IndexerService): void {
  ipcMain.handle(IPC.indexProject, (_event, projectId: unknown) =>
    typeof projectId === 'string' ? indexer.index(projectId) : undefined,
  );
}
