import { ipcMain } from 'electron';
import {
  PERMISSION_MODES,
  ChatError,
  isAgentProviderId,
  type AgentProvider,
  type AgentProviderId,
  type ChatModeId,
  type ProviderAuth,
  type PermissionMode,
  type ReasoningEffort,
} from '@ascua/chat';
import {
  IPC,
  encodeError,
  type AscuaError,
  type ProviderAuthChange,
} from '@ascua/ipc';
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

const MODE_IDS: ChatModeId[] = ['chat', 'locate', 'make', 'review'];

function optionalPermissionMode(value: unknown): PermissionMode | undefined {
  if (value === undefined) return undefined;
  if (!PERMISSION_MODES.includes(value as PermissionMode))
    throw new ChatError('invalidInput');
  return value as PermissionMode;
}

const EFFORTS: ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

function optionalModel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '' || value.length > 200) {
    throw new ChatError('invalidInput');
  }
  return value;
}

function optionalEffort(value: unknown): ReasoningEffort | undefined {
  if (value === undefined) return undefined;
  if (!EFFORTS.includes(value as ReasoningEffort)) {
    throw new ChatError('invalidInput');
  }
  return value as ReasoningEffort;
}

const MAX_ANSWERS = 16;
const MAX_QUESTION_KEY = 2000;
const MAX_ANSWER = 4000;

/** Answers keyed by question text, or null to skip; strings only, bounded. */
export function questionAnswers(value: unknown): Record<string, string> | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChatError('invalidInput');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_ANSWERS) {
    throw new ChatError('invalidInput');
  }
  const out: Record<string, string> = {};
  for (const [key, answer] of entries) {
    if (
      key === '' ||
      key.length > MAX_QUESTION_KEY ||
      typeof answer !== 'string' ||
      answer.length > MAX_ANSWER
    ) {
      throw new ChatError('invalidInput');
    }
    out[key] = answer;
  }
  return out;
}

function providerId(value: unknown): AgentProviderId {
  if (!isAgentProviderId(value)) throw new ChatError('providerDisabled');
  return value;
}

const LOGIN_POLL_MS = 3000;
const LOGIN_WATCH_MS = 5 * 60 * 1000;

export interface LoginTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export function registerChatIpc(
  service: ChatService,
  registry: ProviderRegistry,
  terminals: Pick<TerminalManager, 'openCommand' | 'onExit'>,
  send: (channel: string, payload: unknown) => void,
  getSettings: () => Promise<unknown>,
  timers: LoginTimers = {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
  },
): void {
  const watchers = new Map<AgentProviderId, () => void>();
  const watchLogin = (provider: AgentProvider, terminalId: string): void => {
    const id = provider.descriptor.id;
    watchers.get(id)?.();
    let last: ProviderAuth['state'] | undefined;
    let done = false;
    const check = async (final: boolean): Promise<void> => {
      if (done) return;
      let auth: ProviderAuth;
      try {
        auth = await provider.authStatus();
      } catch {
        return;
      }
      if (done) return;
      const ends = final || auth.state === 'loggedIn';
      if (ends) {
        const change: ProviderAuthChange = { ...auth, final: true };
        send(IPC.chatProviderAuthChanged, change);
      } else if (auth.state !== last) {
        send(IPC.chatProviderAuthChanged, auth);
      }
      last = auth.state;
      if (ends) stop();
    };
    const poll = timers.setInterval(() => void check(false), LOGIN_POLL_MS);
    const limit = timers.setTimeout(() => void check(true), LOGIN_WATCH_MS);
    const stop = (): void => {
      if (done) return;
      done = true;
      timers.clearInterval(poll);
      timers.clearTimeout(limit);
      if (watchers.get(id) === stop) watchers.delete(id);
    };
    watchers.set(id, stop);
    terminals.onExit(terminalId, () => {
      if (!done) void check(true);
    });
  };
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
        const session = await terminals.openCommand(str(projectId), {
          name: 'login', // i18n-ignore: stable id, the renderer shows terminals.loginName
          ...command,
        });
        if (session.status === 'running') {
          watchLogin(provider as AgentProvider, session.id);
        }
        return session;
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
    async (_e, projectId: unknown, prompt: unknown, options?: unknown) => {
      try {
        const o = (options ?? {}) as {
          permissionMode?: unknown;
          model?: unknown;
          effort?: unknown;
        };
        const session = await service.start(str(projectId), str(prompt), {
          permissionMode: optionalPermissionMode(o.permissionMode),
          model: optionalModel(o.model),
          effort: optionalEffort(o.effort),
        });
        return { ok: true, session };
      } catch (error) {
        return { ok: false, error: toError(error) };
      }
    },
  );
  ipcMain.handle(
    IPC.chatCommands,
    async (_e, projectId: unknown, _sessionId?: unknown) => {
      try {
        return await service.commands(str(projectId));
      } catch (error) {
        return thrown(error);
      }
    },
  );
  ipcMain.handle(IPC.chatModels, async (_e, projectId: unknown) => {
    try {
      return await service.models(str(projectId));
    } catch (error) {
      return thrown(error);
    }
  });
  ipcMain.handle(
    IPC.clearChat,
    async (_e, projectId: unknown, sessionId: unknown) => {
      try {
        await service.clear(str(projectId), str(sessionId));
        return undefined;
      } catch (error) {
        return toError(error);
      }
    },
  );
  ipcMain.handle(
    IPC.deleteChat,
    async (_e, projectId: unknown, sessionId: unknown) => {
      try {
        await service.remove(str(projectId), str(sessionId));
        return undefined;
      } catch (error) {
        return toError(error);
      }
    },
  );
  ipcMain.handle(
    IPC.updateChatSession,
    async (_e, projectId: unknown, sessionId: unknown, patch: unknown) => {
      try {
        const p = (patch ?? {}) as {
          permissionMode?: unknown;
          mode?: unknown;
          model?: unknown;
          effort?: unknown;
        };
        const mode = p.mode;
        if (mode !== undefined && !MODE_IDS.includes(mode as ChatModeId)) {
          throw new ChatError('notFound');
        }
        await service.update(str(projectId), str(sessionId), {
          permissionMode: optionalPermissionMode(p.permissionMode),
          mode: mode as ChatModeId | undefined,
          model: p.model === null ? null : optionalModel(p.model),
          effort: p.effort === null ? null : optionalEffort(p.effort),
        });
        return undefined;
      } catch (error) {
        return toError(error);
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
  ipcMain.handle(
    IPC.resolveChatQuestion,
    (
      _e,
      projectId: unknown,
      sessionId: unknown,
      requestId: unknown,
      answers: unknown,
    ) => {
      try {
        service.resolveQuestion(
          str(projectId),
          str(sessionId),
          str(requestId),
          questionAnswers(answers),
        );
        return undefined;
      } catch (error) {
        return toError(error);
      }
    },
  );
}
