import { ipcMain } from 'electron';
import {
  ChatError,
  isAgentProviderId,
  type AgentProviderId,
} from '@ascua/chat';
import { IPC, encodeError, type AscuaError } from '@ascua/ipc';
import type { TerminalManager } from '../terminals/terminal-manager';
import type { ChatService } from './chat-service';
import type { ProviderRegistry } from './provider-registry';

function toError(error: unknown): AscuaError {
  if (error instanceof ChatError) {
    return { code: `chat.${error.kind}`, params: error.params };
  }
  console.error('chat ipc failed', error);
  return { code: 'chat.unknown' };
}

function str(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new ChatError('notFound');
  }
  return value;
}

function providerId(value: unknown): AgentProviderId {
  if (!isAgentProviderId(value)) throw new ChatError('providerDisabled');
  return value;
}

export function registerChatIpc(
  service: ChatService,
  registry: ProviderRegistry,
  terminals: Pick<TerminalManager, 'openCommand'>,
  send: (channel: string, payload: unknown) => void,
  getSettings: () => Promise<unknown>,
): void {
  const thrown = (error: unknown): never => {
    throw new Error(encodeError(toError(error)));
  };

  ipcMain.handle(IPC.chatProviders, () => registry.list().catch(thrown));
  ipcMain.handle(IPC.chatProviderAuth, async (_e, id: unknown) => {
    try {
      const provider = registry.get(providerId(id));
      if (!provider) throw new ChatError('providerDisabled');
      return await provider.authStatus();
    } catch (error) {
      return thrown(error);
    }
  });
  ipcMain.handle(
    IPC.chatProviderLogin,
    async (_e, projectId: unknown, id: unknown) => {
      try {
        const provider = registry.get(providerId(id));
        const command = provider?.loginCommand();
        if (!command) throw new ChatError('providerDisabled');
        return await terminals.openCommand(str(projectId), {
          name: 'login', // i18n-ignore: stable id, the renderer shows terminals.loginName
          ...command,
        });
      } catch (error) {
        return toError(error);
      }
    },
  );
  ipcMain.handle(IPC.chatSelectProvider, async (_e, id: unknown) => {
    try {
      await registry.select(providerId(id));
      const settings = await getSettings();
      send(IPC.settingsChanged, settings);
      return settings;
    } catch (error) {
      return thrown(error);
    }
  });
  ipcMain.handle(IPC.listChatSessions, async (_e, projectId: unknown) => {
    try {
      return await service.list(str(projectId));
    } catch (error) {
      return thrown(error);
    }
  });
  ipcMain.handle(
    IPC.startChat,
    async (_e, projectId: unknown, prompt: unknown) => {
      try {
        const session = await service.start(str(projectId), str(prompt));
        return { ok: true, session };
      } catch (error) {
        return { ok: false, error: toError(error) };
      }
    },
  );
  ipcMain.handle(
    IPC.chatTranscript,
    async (_e, projectId: unknown, sessionId: unknown) => {
      try {
        return await service.transcript(str(projectId), str(sessionId));
      } catch (error) {
        return thrown(error);
      }
    },
  );
  ipcMain.handle(
    IPC.sendChatPrompt,
    async (_e, projectId: unknown, sessionId: unknown, text: unknown) => {
      try {
        await service.send(str(projectId), str(sessionId), str(text));
        return undefined;
      } catch (error) {
        return toError(error);
      }
    },
  );
  ipcMain.handle(
    IPC.abortChat,
    (_e, projectId: unknown, sessionId: unknown) => {
      try {
        service.abort(str(projectId), str(sessionId));
      } catch (error) {
        thrown(error);
      }
    },
  );
  ipcMain.handle(
    IPC.resolveChatPermission,
    (
      _e,
      projectId: unknown,
      sessionId: unknown,
      requestId: unknown,
      allow: unknown,
    ) => {
      try {
        if (typeof allow !== 'boolean') throw new ChatError('notFound');
        service.resolvePermission(
          str(projectId),
          str(sessionId),
          str(requestId),
          allow,
        );
        return undefined;
      } catch (error) {
        return toError(error);
      }
    },
  );
}
