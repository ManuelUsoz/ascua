import type { ToolContext, ToolRegistry } from '@ascua/assistant';

export const SUPPORTED_PROTOCOLS = [
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

export interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function fail(
  id: RpcResponse['id'],
  code: number,
  message: string,
): RpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function ok(id: RpcResponse['id'], result: unknown): RpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** JSON-RPC 2.0 handler for the MCP tools surface. Returns undefined for notifications. */
export async function handleRpc(
  registry: ToolRegistry,
  message: unknown,
  ctx: ToolContext,
): Promise<RpcResponse | undefined> {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return fail(null, -32600, 'invalid request'); // i18n-ignore
  }
  const req = message as RpcRequest;
  const isNotification = req.id === undefined;
  const id = req.id ?? null;
  if (typeof req.method !== 'string') {
    return isNotification ? undefined : fail(id, -32600, 'invalid request'); // i18n-ignore
  }
  if (req.method.startsWith('notifications/') || isNotification)
    return undefined;

  const params = record(req.params);
  switch (req.method) {
    case 'initialize': {
      const asked = params['protocolVersion'];
      const version = (SUPPORTED_PROTOCOLS as readonly unknown[]).includes(
        asked,
      )
        ? asked
        : SUPPORTED_PROTOCOLS[0];
      return ok(id, {
        protocolVersion: version,
        capabilities: { tools: {} },
        serverInfo: { name: 'ascua', version: '1.0.0' },
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, {
        tools: registry.list().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case 'tools/call': {
      const name = params['name'];
      if (typeof name !== 'string')
        return fail(id, -32602, 'missing tool name'); // i18n-ignore
      const outcome = await registry.call(name, params['arguments'], ctx);
      let payload: unknown;
      if (outcome.ok === true) payload = outcome.value;
      else payload = { error: outcome.error, detail: outcome.detail };
      return ok(id, {
        content: [{ type: 'text', text: JSON.stringify(payload ?? null) }],
        isError: !outcome.ok,
      });
    }
    default:
      return fail(id, -32601, 'method not found'); // i18n-ignore
  }
}
