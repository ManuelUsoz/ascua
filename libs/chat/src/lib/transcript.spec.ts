import { describe, expect, it } from 'vitest';
import type { ChatEvent } from './events';
import { pendingPermissions, type Message } from './model';
import { applyChatEvent } from './transcript';

const ids = { sessionId: 's', projectId: 'p' };
const msg = (parts: Message['parts'] = []): Message => ({
  id: 'm1',
  sessionId: 's',
  role: 'assistant',
  parts,
  createdAt: 1,
});
const fold = (events: ChatEvent[], start: Message[] = []) =>
  events.reduce(applyChatEvent, start);

const request = {
  requestId: 'r1',
  tool: 'execute' as const,
  title: 'Run',
};

describe('applyChatEvent', () => {
  it('merges deltas into the last part of the same kind', () => {
    const out = fold([
      { ...ids, type: 'messageStarted', message: msg() },
      {
        ...ids,
        type: 'messageDelta',
        messageId: 'm1',
        part: 'text',
        text: 'a',
      },
      {
        ...ids,
        type: 'messageDelta',
        messageId: 'm1',
        part: 'text',
        text: 'b',
      },
      {
        ...ids,
        type: 'messageDelta',
        messageId: 'm1',
        part: 'thinking',
        text: 'c',
      },
    ]);
    expect(out[0].parts).toEqual([
      { kind: 'text', text: 'ab' },
      { kind: 'thinking', text: 'c' },
    ]);
  });

  it('upserts tool parts by toolUseId', () => {
    const tool = {
      kind: 'toolUse' as const,
      toolUseId: 't',
      tool: 'read' as const,
      title: 'x',
    };
    const out = fold([
      { ...ids, type: 'messageStarted', message: msg() },
      {
        ...ids,
        type: 'toolUpdated',
        messageId: 'm1',
        part: { ...tool, status: 'running' },
      },
      {
        ...ids,
        type: 'toolUpdated',
        messageId: 'm1',
        part: { ...tool, status: 'done' },
      },
    ]);
    expect(out[0].parts).toHaveLength(1);
    expect(out[0].parts[0]).toMatchObject({ status: 'done' });
  });

  it('requests then settles a permission', () => {
    const requested = fold([
      { ...ids, type: 'messageStarted', message: msg() },
      { ...ids, type: 'permissionRequested', messageId: 'm1', request },
    ]);
    expect(pendingPermissions(requested)).toEqual([request]);
    const settled = applyChatEvent(requested, {
      ...ids,
      type: 'permissionSettled',
      messageId: 'm1',
      requestId: 'r1',
      allowed: false,
    });
    expect(settled[0].parts[0]).toMatchObject({ state: 'denied' });
    expect(pendingPermissions(settled)).toEqual([]);
  });

  it('replaces the message on completion', () => {
    const done = {
      ...msg([{ kind: 'text', text: 'final' }]),
      stop: 'endTurn' as const,
    };
    const out = fold(
      [{ ...ids, type: 'messageCompleted', message: done }],
      [msg([{ kind: 'text', text: 'partial' }])],
    );
    expect(out).toEqual([done]);
  });
});
