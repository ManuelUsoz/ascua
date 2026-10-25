import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_USAGE, type ChatSessionRecord, type Message } from '@ascua/chat';
import { JsonChatSessionStore } from './json-chat-session-store';

const record = (
  id: string,
  projectId: string,
  extra: Partial<ChatSessionRecord> = {},
): ChatSessionRecord => ({
  id,
  projectId,
  provider: 'claude',
  mode: 'chat',
  createdAt: 1,
  updatedAt: 1,
  status: 'idle',
  usage: { ...EMPTY_USAGE },
  messages: [],
  ...extra,
});

const message = (id: string): Message => ({
  id,
  sessionId: 's1',
  role: 'user',
  parts: [{ kind: 'text', text: 'hola' }],
  createdAt: 1,
});

describe('JsonChatSessionStore', () => {
  let dir: string;
  const make = () => new JsonChatSessionStore(join(dir, 'chats'));

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ascua-chats-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('round trips and isolates projects', async () => {
    const store = make();
    await store.save(record('s1', 'p1', { resumeToken: 'tok' }));
    await store.save(record('s2', 'p2'));
    await store.appendMessage('p1', 's1', message('m1'));
    const fresh = make();
    expect((await fresh.list('p1')).map((s) => s.id)).toEqual(['s1']);
    expect((await fresh.get('p1', 's1'))?.messages).toHaveLength(1);
    expect((await fresh.get('p1', 's1'))?.resumeToken).toBe('tok');
    expect(await fresh.get('p1', 's2')).toBeUndefined();
    expect(await fresh.list('p3')).toEqual([]);
  });

  it('refuses a projectId that is not a safe file name', async () => {
    const store = make();
    await expect(store.list('..')).rejects.toThrow();
    await expect(store.save(record('s', '../x'))).rejects.toThrow();
  });

  it('sets a corrupt file aside', async () => {
    const store = make();
    await store.save(record('s1', 'p1'));
    await writeFile(join(dir, 'chats', 'p1.json'), '{ nope', 'utf8');
    expect(await make().list('p1')).toEqual([]);
    const files = await readdir(join(dir, 'chats'));
    expect(files.some((f) => f.startsWith('p1.json.corrupt-'))).toBe(true);
  });

  it('loads a stale pending permission as denied and a running status as idle', async () => {
    const store = make();
    await store.save(
      record('s1', 'p1', {
        status: 'awaitingPermission',
        messages: [
          {
            ...message('m1'),
            role: 'assistant',
            parts: [
              {
                kind: 'permission',
                state: 'pending',
                request: { requestId: 'r1', tool: 'execute', title: 'Bash' },
              },
            ],
          },
        ],
      }),
    );
    const loaded = (await make().list('p1'))[0];
    expect(loaded.status).toBe('idle');
    expect(loaded.messages[0].parts[0]).toMatchObject({ state: 'denied' });
  });

  it('migrates legacy permission modes once and keeps new ones', async () => {
    const store = make();
    await store.save(record('s1', 'p1'));
    const path = join(dir, 'chats', 'p1.json');
    const raw = JSON.parse(await readFile(path, 'utf8'));
    const items = raw.sessions as Record<string, unknown>[];
    const legacy = (id: string, mode: string) => {
      const { permissionModes: _drop, ...rest } = {
        ...items[0],
        id,
        permissionMode: mode,
      };
      void _drop;
      return rest;
    };
    const out = [legacy('a', 'manual'), legacy('b', 'auto')];
    await writeFile(path, JSON.stringify({ ...raw, sessions: out }), 'utf8');
    const fresh = make();
    const loaded = await fresh.list('p1');
    expect(loaded.map((s) => s.permissionMode)).toEqual([
      'supervised',
      'fullAccess',
    ]);
    // A new 'auto' (stamped on save) is not migrated again.
    await fresh.save({ ...loaded[0], id: 'c', permissionMode: 'auto' });
    expect((await make().get('p1', 'c'))?.permissionMode).toBe('auto');
  });

  it('removes one session', async () => {
    const store = make();
    await store.save(record('s1', 'p1'));
    await store.save(record('s2', 'p1'));
    await store.remove('p1', 's1');
    expect((await store.list('p1')).map((s) => s.id)).toEqual(['s2']);
  });

  it('removes a project file', async () => {
    const store = make();
    await store.save(record('s1', 'p1'));
    await store.removeProject('p1');
    expect(existsSync(join(dir, 'chats', 'p1.json'))).toBe(false);
    expect(await store.list('p1')).toEqual([]);
  });
});
