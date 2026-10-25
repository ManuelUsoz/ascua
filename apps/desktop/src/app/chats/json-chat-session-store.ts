import {
  toPermissionMode,
  type ChatSessionRecord,
  type ChatSessionStore,
  type Message,
} from '@ascua/chat';
import { ProjectJsonFiles } from './project-json-files';

type StampedRecord = ChatSessionRecord & { permissionModes?: number };

/** A request that outlived the app can never be answered. */
function settle(records: ChatSessionRecord[]): ChatSessionRecord[] {
  for (const record of records) {
    // 'auto' changed meaning: only records written before the marker migrate.
    const stamped = record as StampedRecord;
    if (!stamped.permissionModes) {
      record.permissionMode = toPermissionMode(record.permissionMode);
      stamped.permissionModes = 2;
    }
    if (record.status === 'running' || record.status === 'awaitingPermission') {
      record.status = 'idle';
    }
    for (const message of record.messages ?? []) {
      for (const part of message.parts) {
        if (part.kind === 'permission' && part.state === 'pending') {
          part.state = 'denied';
        }
      }
    }
  }
  return records;
}

export class JsonChatSessionStore implements ChatSessionStore {
  private readonly files: ProjectJsonFiles<ChatSessionRecord>;

  constructor(dir: string) {
    this.files = new ProjectJsonFiles(dir, 'sessions', settle);
  }

  list(projectId: string): Promise<ChatSessionRecord[]> {
    return this.files.read(projectId);
  }

  async get(
    projectId: string,
    id: string,
  ): Promise<ChatSessionRecord | undefined> {
    return (await this.files.read(projectId)).find((s) => s.id === id);
  }

  async save(record: ChatSessionRecord): Promise<void> {
    (record as StampedRecord).permissionModes = 2;
    await this.files.update(record.projectId, (sessions) => {
      const index = sessions.findIndex((s) => s.id === record.id);
      if (index >= 0) sessions[index] = record;
      else sessions.push(record);
      return { items: sessions };
    });
  }

  async appendMessage(
    projectId: string,
    id: string,
    message: Message,
  ): Promise<void> {
    await this.files.update(projectId, (sessions) => {
      const session = sessions.find((s) => s.id === id);
      if (session) {
        const index = session.messages.findIndex((m) => m.id === message.id);
        if (index >= 0) session.messages[index] = message;
        else session.messages.push(message);
      }
      return { items: sessions };
    });
  }

  async remove(projectId: string, id: string): Promise<void> {
    await this.files.update(projectId, (sessions) => ({
      items: sessions.filter((s) => s.id !== id),
    }));
  }

  removeProject(projectId: string): Promise<void> {
    return this.files.remove(projectId);
  }
}
