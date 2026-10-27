import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { ToolRegistry } from '@ascua/assistant';
import { McpHttpServer, type McpEndpoint } from './mcp-http-server';

const registry = new ToolRegistry(
  [
    {
      id: 'demo',
      tools: [
        {
          name: 'demo_ping',
          description: 'ping',
          effect: 'read',
          inputSchema: { type: 'object', properties: {} },
          run: async () => ({ pong: true }),
        },
      ],
    },
  ],
  { confirm: async () => false },
);

let server: McpHttpServer;
let endpoint: McpEndpoint;

beforeEach(async () => {
  server = new McpHttpServer(registry);
  endpoint = await server.start();
});
afterEach(() => server.stop());

const rpc = (body: unknown, token = endpoint.token) =>
  fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

describe('McpHttpServer', () => {
  it('rejects a missing or wrong token with 401', async () => {
    const none = await fetch(endpoint.url, { method: 'POST', body: '{}' });
    expect(none.status).toBe(401);
    expect((await rpc({}, 'wrong')).status).toBe(401);
  });

  it('rejects a foreign Host with 403', async () => {
    const url = new URL(endpoint.url);
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: url.port,
          path: '/mcp',
          method: 'POST',
          headers: {
            Host: 'evil.example',
            Authorization: `Bearer ${endpoint.token}`,
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    expect(status).toBe(403);
  });

  it('rejects any Origin with 403', async () => {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        Origin: 'http://evil.example',
        Authorization: `Bearer ${endpoint.token}`,
      },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('answers GET with 405', async () => {
    const res = await fetch(endpoint.url, {
      headers: { Authorization: `Bearer ${endpoint.token}` },
    });
    expect(res.status).toBe(405);
  });

  it('round-trips tools/list and tools/call', async () => {
    const list = await (
      await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    ).json();
    expect(list.result.tools[0].name).toBe('demo_ping');
    const call = await (
      await rpc({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'demo_ping', arguments: {} },
      })
    ).json();
    expect(call.result).toEqual({
      content: [{ type: 'text', text: '{"pong":true}' }],
      isError: false,
    });
  });

  it('returns 202 for notifications', async () => {
    const res = await rpc({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(res.status).toBe(202);
  });
});
