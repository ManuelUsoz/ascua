import { describe, expect, it } from 'vitest';
import { ToolRegistry, type Capability } from '@ascua/assistant';
import { handleRpc } from './mcp-rpc';

const capability: Capability = {
  id: 'demo',
  tools: [
    {
      name: 'demo_echo',
      description: 'echo',
      effect: 'read',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      run: async (input: { text: string }) => ({ echoed: input.text }),
    },
  ],
};
const registry = new ToolRegistry([capability], { confirm: async () => false });
const ctx = { signal: new AbortController().signal };

describe('handleRpc', () => {
  it('initializes echoing a supported version', async () => {
    const r = await handleRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      },
      ctx,
    );
    expect(r?.result).toMatchObject({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'ascua' },
    });
  });

  it('falls back to the latest version', async () => {
    const r = await handleRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '1999' },
      },
      ctx,
    );
    expect(r?.result).toMatchObject({ protocolVersion: '2025-06-18' });
  });

  it('ignores notifications', async () => {
    expect(
      await handleRpc(
        registry,
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        ctx,
      ),
    ).toBeUndefined();
  });

  it('answers ping and lists tools', async () => {
    expect(
      (
        await handleRpc(
          registry,
          { jsonrpc: '2.0', id: 2, method: 'ping' },
          ctx,
        )
      )?.result,
    ).toEqual({});
    const list = await handleRpc(
      registry,
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      ctx,
    );
    expect(list?.result).toMatchObject({ tools: [{ name: 'demo_echo' }] });
  });

  it('calls tools and reports failures as isError', async () => {
    const good = await handleRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'demo_echo', arguments: { text: 'hi' } },
      },
      ctx,
    );
    expect(good?.result).toEqual({
      content: [{ type: 'text', text: '{"echoed":"hi"}' }],
      isError: false,
    });
    const bad = await handleRpc(
      registry,
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'demo_echo', arguments: {} },
      },
      ctx,
    );
    expect(bad?.result).toMatchObject({ isError: true });
  });

  it('rejects unknown methods with -32601', async () => {
    const r = await handleRpc(
      registry,
      { jsonrpc: '2.0', id: 6, method: 'nope' },
      ctx,
    );
    expect(r?.error?.code).toBe(-32601);
  });
});
