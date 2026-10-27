import { describe, expect, it } from 'vitest';
import type { ChatEvent } from './events';
import { pendingPermissions, pendingQuestions, type Message } from './model';
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
  it('empties the transcript on transcriptCleared', () => {
    expect(fold([{ ...ids, type: 'transcriptCleared' }], [msg()])).toEqual([]);
  });

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

  it('requests then answers a question', () => {
    const question = {
      requestId: 'q1',
      questions: [
        {
          question: 'Which?',
          multiSelect: false,
          options: [{ label: 'A' }, { label: 'B' }],
        },
      ],
    };
    const requested = fold([
      { ...ids, type: 'messageStarted', message: msg() },
      {
        ...ids,
        type: 'questionRequested',
        messageId: 'm1',
        request: question,
      },
    ]);
    expect(pendingQuestions(requested)).toEqual([question]);
    expect(requested[0].parts[0]).toMatchObject({
      kind: 'question',
      state: 'pending',
    });
    const answered = applyChatEvent(requested, {
      ...ids,
      type: 'questionSettled',
      messageId: 'm1',
      requestId: 'q1',
      answers: { 'Which?': 'A' },
    });
    expect(answered[0].parts[0]).toMatchObject({
      state: 'answered',
      answers: { 'Which?': 'A' },
    });
    expect(pendingQuestions(answered)).toEqual([]);
  });

  it('marks only the matching question as skipped', () => {
    const requested = fold([
      { ...ids, type: 'messageStarted', message: msg() },
      {
        ...ids,
        type: 'questionRequested',
        messageId: 'm1',
        request: { requestId: 'q1', questions: [] },
      },
      {
        ...ids,
        type: 'questionSettled',
        messageId: 'm1',
        requestId: 'other',
        skipped: true,
      },
    ]);
    expect(requested[0].parts[0]).toMatchObject({ state: 'pending' });
    const skipped = applyChatEvent(requested, {
      ...ids,
      type: 'questionSettled',
      messageId: 'm1',
      requestId: 'q1',
      skipped: true,
    });
    expect(skipped[0].parts[0]).toMatchObject({ state: 'skipped' });
    expect(skipped[0].parts[0]).not.toHaveProperty('answers');
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
