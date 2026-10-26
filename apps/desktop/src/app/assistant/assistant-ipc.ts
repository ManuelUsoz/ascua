import { app, ipcMain } from 'electron';
import { AssistantError } from '@ascua/assistant';
import { IPC, encodeError, type AscuaError, type ErrorCode } from '@ascua/ipc';
import type { AssistantService } from './assistant-service';
import type { UiContextStore } from './ui-context';

export function toAssistantError(error: unknown): AscuaError {
  if (error instanceof AssistantError && error.kind !== 'unknown') {
    return { code: `assistant.${error.kind}` as ErrorCode };
  }
  // The renderer only gets the code; the detail stays in main's log.
  console.error(
    '[assistant] unexpected error:',
    error instanceof Error ? error.message : String(error),
  );
  return { code: 'unknown' };
}

/** Rethrow as an encoded error code instead of a raw error. */
async function guarded<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(encodeError(toAssistantError(error)));
  }
}

export function registerAssistantIpc(
  service: AssistantService,
  context: Pick<UiContextStore, 'set'>,
): void {
  ipcMain.handle(IPC.assistantSend, (_e, text: unknown) =>
    guarded(() => {
      if (typeof text !== 'string') {
        throw new TypeError('invalid message'); // i18n-ignore
      }
      return service.send(text);
    }),
  );
  ipcMain.handle(IPC.assistantCancel, () => guarded(() => service.cancel()));
  ipcMain.handle(IPC.assistantReset, () => guarded(() => service.reset()));
  ipcMain.handle(IPC.assistantStatus, (_e, refresh: unknown) =>
    guarded(() => service.snapshot(refresh === true)),
  );
  ipcMain.handle(IPC.assistantWarm, () => guarded(() => service.warm()));
  ipcMain.on(IPC.assistantContext, (_e, raw: unknown) => context.set(raw));
  app.on('will-quit', () => service.stop());
}
