import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import {
  TurnMapper,
  authFailure,
  claudeRuntimeOptions,
  toProviderModels,
  toChatError,
  toPermissionRequest,
  toQuestionRequest,
  toSdkAnswer,
  toSdkPermission,
  toStopReason,
  toUsage,
} from './claude-mapping';

const m = (x: unknown) => x as SDKMessage;
const delta = (delta: object, parent: string | null = null) =>
  m({
    type: 'stream_event',
    parent_tool_use_id: parent,
    event: { type: 'content_block_delta', delta },
  });

describe('TurnMapper', () => {
  it('maps deltas once and ignores full assistant text', () => {
    const t = new TurnMapper();
    expect(t.map(delta({ type: 'text_delta', text: 'hi' }))).toEqual([
      { type: 'messageDelta', part: 'text', text: 'hi' },
    ]);
    expect(t.map(delta({ type: 'thinking_delta', thinking: 'hm' }))).toEqual([
      { type: 'messageDelta', part: 'thinking', text: 'hm' },
    ]);
    expect(
      t.map(
        m({
          type: 'assistant',
          parent_tool_use_id: null,
          message: { content: [{ type: 'text', text: 'hi' }] },
        }),
      ),
    ).toEqual([]);
  });

  it('tracks the tool lifecycle', () => {
    const t = new TurnMapper();
    const use = t.map(
      m({
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'tool_use',
              id: 't1',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        },
      }),
    );
    expect(use[0]).toMatchObject({
      part: { kind: 'toolUse', tool: 'execute', status: 'running' },
    });
    const res = t.map(
      m({
        type: 'user',
        parent_tool_use_id: null,
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              is_error: true,
              content: 'x',
            },
          ],
        },
      }),
    );
    expect(res[0]).toMatchObject({ part: { status: 'failed' } });
    expect(res[1]).toMatchObject({
      part: { kind: 'toolResult', isError: true, summary: 'x' },
    });
  });

  it('joins the text blocks of an MCP tool result', () => {
    const t = new TurnMapper();
    const res = t.map(
      m({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't9',
              content: [
                { type: 'text', text: 'one' },
                { type: 'image', data: 'x' },
                { type: 'text', text: 'two' },
              ],
            },
          ],
        },
      }),
    );
    expect(res.at(-1)).toMatchObject({
      part: { kind: 'toolResult', isError: false, summary: 'one\ntwo' },
    });
  });

  it('maps init model and commands_changed custom commands', () => {
    const t = new TurnMapper();
    expect(
      t.map(m({ type: 'system', subtype: 'init', model: 'opus' })),
    ).toEqual([{ type: 'sessionInfo', model: 'opus' }]);
    expect(
      t.map(
        m({
          type: 'system',
          subtype: 'commands_changed',
          commands: [
            { name: 'cost', builtin: true },
            { name: 'ship', description: 'd', argumentHint: '<a>' },
          ],
        }),
      ),
    ).toEqual([
      {
        type: 'sessionInfo',
        commands: [
          {
            name: 'ship',
            source: 'custom',
            description: 'd',
            argumentHint: '<a>',
          },
        ],
      },
    ]);
  });

  it('records api error assistant messages as the turn error', () => {
    const mk = (error: string, text: string) =>
      ({
        type: 'assistant',
        error,
        is_api_error_message: true,
        message: { model: '<synthetic>', content: [{ type: 'text', text }] },
      }) as unknown as SDKMessage;
    const a = new TurnMapper();
    expect(
      a.map(mk('authentication_failed', 'Failed to authenticate')),
    ).toEqual([]);
    expect(a.takeError()?.kind).toBe('authRequired');
    expect(a.takeError()).toBeUndefined();
    const b = new TurnMapper();
    b.map(mk('server_error', 'boom'));
    expect(b.takeError()?.kind).toBe('promptFailed');
  });

  it('drops subagent output', () => {
    const t = new TurnMapper();
    expect(t.map(delta({ type: 'text_delta', text: 'x' }, 'p'))).toEqual([]);
  });

  const toolUse = (
    id: string,
    name: string,
    input: object,
    parent: string | null = null,
  ) =>
    m({
      type: 'assistant',
      parent_tool_use_id: parent,
      message: { content: [{ type: 'tool_use', id, name, input }] },
    });

  it('keeps parentToolUseId of nested tool calls', () => {
    const t = new TurnMapper();
    const out = t.map(toolUse('c1', 'Read', { file_path: '/a' }, 'task1'));
    expect(out[0]).toMatchObject({
      part: { toolUseId: 'c1', parentToolUseId: 'task1' },
    });
    const top = t.map(toolUse('c2', 'Read', { file_path: '/a' }));
    expect(top[0]).toMatchObject({ part: { toolUseId: 'c2' } });
    expect(JSON.stringify(top[0])).not.toContain('parentToolUseId');
  });

  it('reads agent from Task/Agent subagent_type only', () => {
    const t = new TurnMapper();
    expect(
      t.map(toolUse('a', 'Task', { subagent_type: 'scout' }))[0],
    ).toMatchObject({ part: { agent: 'scout' } });
    expect(
      t.map(toolUse('b', 'Agent', { subagent_type: 'implementer' }))[0],
    ).toMatchObject({ part: { agent: 'implementer' } });
    expect(
      JSON.stringify(t.map(toolUse('c', 'Bash', { subagent_type: 'x' }))[0]),
    ).not.toContain('agent');
  });

  it('reads path from file_path, path or notebook_path', () => {
    const t = new TurnMapper();
    const path = (input: object) =>
      t.map(toolUse('p', 'Read', input))[0] as { part: { path?: string } };
    expect(path({ file_path: '/f' }).part.path).toBe('/f');
    expect(path({ path: '/g' }).part.path).toBe('/g');
    expect(path({ notebook_path: '/n' }).part.path).toBe('/n');
    expect(path({}).part.path).toBeUndefined();
  });
});

describe('runtime mapping', () => {
  it('maps permission modes', () => {
    const mode = (m: 'supervised' | 'acceptEdits' | 'auto' | 'fullAccess') =>
      claudeRuntimeOptions({ permissionMode: m });
    expect(mode('supervised')).toEqual({ permissionMode: 'default' });
    expect(mode('acceptEdits')).toEqual({ permissionMode: 'acceptEdits' });
    expect(mode('auto')).toEqual({ permissionMode: 'auto' });
    expect(mode('fullAccess')).toEqual({
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    });
  });

  it('adds model and effort only when set', () => {
    expect(
      claudeRuntimeOptions({
        permissionMode: 'auto',
        model: 'opus',
        effort: 'max',
      }),
    ).toMatchObject({ model: 'opus', effort: 'max' });
  });

  it('maps models', () => {
    expect(
      toProviderModels([
        { value: 'haiku', displayName: 'Haiku', description: '' },
      ]),
    ).toEqual([{ id: 'haiku', label: 'Haiku', efforts: [] }]);
  });
});

describe('mapping helpers', () => {
  it('maps usage and cost', () => {
    expect(
      toUsage({
        usage: {
          input_tokens: 1,
          output_tokens: 2,
          cache_read_input_tokens: 3,
          cache_creation_input_tokens: 4,
        },
        total_cost_usd: 0.5,
        modelUsage: { 'claude-x': {} },
      }),
    ).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
      costUsd: 0.5,
      model: 'claude-x',
    });
  });

  it('maps stop reasons', () => {
    const ok = {
      subtype: 'success',
      stop_reason: 'end_turn',
      is_error: false,
    } as const;
    expect(toStopReason(ok, false)).toBe('endTurn');
    expect(toStopReason(ok, true)).toBe('aborted');
    expect(toStopReason({ ...ok, stop_reason: 'max_tokens' }, false)).toBe(
      'maxTokens',
    );
    expect(toStopReason({ ...ok, is_error: true }, false)).toBe('failed');
  });

  it('builds permission requests and results', () => {
    const r = toPermissionRequest(
      'r',
      'Bash',
      { command: 'x'.repeat(500) },
      'u',
    );
    expect(r.tool).toBe('execute');
    expect(r.detail?.length).toBeLessThanOrEqual(200);
    expect(toSdkPermission({ allow: true }, { a: 1 })).toEqual({
      behavior: 'allow',
      updatedInput: { a: 1 },
    });
    expect(toSdkPermission({ allow: false }, {})).toMatchObject({
      behavior: 'deny',
    });
  });

  it('parses AskUserQuestion input into a question request', () => {
    const input = {
      questions: [
        {
          question: 'Which library?',
          header: 'Library',
          multiSelect: false,
          options: [
            { label: 'date-fns', description: 'Small' },
            { label: 'luxon', description: '' },
            { nope: true },
          ],
        },
        { question: 'Features?', multiSelect: true, options: [] },
        { header: 'no question' },
        'junk',
      ],
    };
    expect(toQuestionRequest('q', input, 'u')).toEqual({
      requestId: 'q',
      toolUseId: 'u',
      questions: [
        {
          question: 'Which library?',
          header: 'Library',
          multiSelect: false,
          options: [
            { label: 'date-fns', description: 'Small' },
            { label: 'luxon' },
          ],
        },
        { question: 'Features?', multiSelect: true, options: [] },
      ],
    });
    expect(toQuestionRequest('q', {})).toBeUndefined();
    expect(toQuestionRequest('q', { questions: [{}] })).toBeUndefined();
  });

  it('maps question decisions to SDK results', () => {
    const input = { questions: [] };
    expect(
      toSdkAnswer({ answered: true, answers: { 'Q?': 'A, B' } }, input),
    ).toEqual({
      behavior: 'allow',
      updatedInput: { questions: [], answers: { 'Q?': 'A, B' } },
    });
    expect(toSdkAnswer({ answered: false, reason: 'skipped' }, input)).toEqual({
      behavior: 'deny',
      message: 'The user skipped the questions.',
    });
    expect(
      toSdkAnswer({ answered: false, reason: 'aborted' }, input),
    ).toMatchObject({ behavior: 'deny', message: 'The request was aborted.' });
  });

  it('maps errors', () => {
    expect(authFailure('Not logged in')).toBe(true);
    expect(toChatError(new Error('spawn ENOENT'), 'start').kind).toBe(
      'agentMissing',
    );
    expect(toChatError(new Error('401'), 'prompt').kind).toBe('authRequired');
    expect(toChatError(new Error('boom'), 'prompt').kind).toBe('promptFailed');
    expect(toChatError(new Error('boom'), 'start').kind).toBe('startFailed');
  });
});
