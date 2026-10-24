import { ipcMain } from 'electron';
import { IPC, encodeError } from '@ascua/ipc';
import {
  isProviderId,
  type ProviderId,
  type ReviewEvent,
  type ReviewInput,
} from '@ascua/source-control';
import {
  toAscuaError,
  type SourceControlService,
} from './source-control-service';

/** Rethrow as an encoded error code instead of a raw error. */
async function guarded<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(encodeError(toAscuaError(error)));
  }
}

function provider(value: unknown): ProviderId {
  if (!isProviderId(value)) throw new TypeError('invalid provider'); // i18n-ignore
  return value;
}

function repoId(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new TypeError('invalid repository'); // i18n-ignore
  }
  return value;
}

function prNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TypeError('invalid pull request'); // i18n-ignore
  }
  return value;
}

const REVIEW_EVENTS: readonly ReviewEvent[] = [
  'approve',
  'requestChanges',
  'comment',
];

function review(value: unknown): ReviewInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('invalid review'); // i18n-ignore
  }
  const { event, body } = value as { event?: unknown; body?: unknown };
  if (!REVIEW_EVENTS.includes(event as ReviewEvent)) {
    throw new TypeError('invalid review'); // i18n-ignore
  }
  if (body === undefined) return { event: event as ReviewEvent };
  if (typeof body !== 'string') {
    throw new TypeError('invalid review'); // i18n-ignore
  }
  return { event: event as ReviewEvent, body };
}

function query<T extends object>(value: unknown): T {
  if (value === undefined || value === null) return {} as T;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid query'); // i18n-ignore
  }
  return value as T;
}

export function registerSourceControlIpc(service: SourceControlService): void {
  ipcMain.handle(IPC.sourceControlStatus, (_e, p: unknown) =>
    guarded(() => service.status(provider(p))),
  );
  ipcMain.handle(IPC.sourceControlConnect, (_e, p: unknown) =>
    guarded(() => service.connect(provider(p))),
  );
  ipcMain.handle(IPC.sourceControlCancel, (_e, p: unknown) =>
    guarded(() => service.cancel(provider(p))),
  );
  ipcMain.handle(IPC.sourceControlOpenVerification, (_e, p: unknown) =>
    guarded(() => service.openVerification(provider(p))),
  );
  ipcMain.handle(IPC.sourceControlDisconnect, (_e, p: unknown) =>
    guarded(() => service.disconnect(provider(p))),
  );
  ipcMain.handle(IPC.sourceControlRepositories, (_e, p: unknown, q: unknown) =>
    guarded(() => service.listRepositories(provider(p), query(q))),
  );
  ipcMain.handle(
    IPC.sourceControlPullRequests,
    (_e, p: unknown, id: unknown, q: unknown) =>
      guarded(() =>
        service.listPullRequests(provider(p), repoId(id), query(q)),
      ),
  );
  ipcMain.handle(
    IPC.sourceControlBranches,
    (_e, p: unknown, id: unknown, q: unknown) =>
      guarded(() => service.listBranches(provider(p), repoId(id), query(q))),
  );
  ipcMain.handle(
    IPC.sourceControlCommits,
    (_e, p: unknown, id: unknown, q: unknown) =>
      guarded(() => service.listCommits(provider(p), repoId(id), query(q))),
  );
  ipcMain.handle(
    IPC.sourceControlDiff,
    (_e, p: unknown, id: unknown, n: unknown, q: unknown) =>
      guarded(() =>
        service.getPullRequestDiff(
          provider(p),
          repoId(id),
          prNumber(n),
          query(q),
        ),
      ),
  );
  ipcMain.handle(
    IPC.sourceControlReview,
    (_e, p: unknown, id: unknown, n: unknown, r: unknown) =>
      guarded(() =>
        service.submitReview(provider(p), repoId(id), prNumber(n), review(r)),
      ),
  );
  ipcMain.handle(IPC.sourceControlOpenUrl, (_e, p: unknown, url: unknown) =>
    guarded(() => {
      if (typeof url !== 'string') {
        throw new TypeError('invalid url'); // i18n-ignore
      }
      return service.openWebUrl(provider(p), url);
    }),
  );
}
