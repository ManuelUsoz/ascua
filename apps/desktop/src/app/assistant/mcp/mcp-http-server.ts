import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ToolRegistry } from '@ascua/assistant';
import { handleRpc } from './mcp-rpc';

const MAX_BODY = 1024 * 1024;

export interface McpEndpoint {
  url: string;
  token: string;
}

export class McpHttpServer {
  private server?: Server;
  private token = '';
  private port = 0;

  constructor(private readonly registry: ToolRegistry) {}

  async start(): Promise<McpEndpoint> {
    if (this.server) return { url: this.url(), token: this.token };
    this.token = randomBytes(32).toString('hex');
    const server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    this.port = (server.address() as AddressInfo).port;
    this.server = server;
    return { url: this.url(), token: this.token };
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }

  private url(): string {
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  private authorized(req: IncomingMessage): boolean {
    const header = req.headers.authorization ?? '';
    const expected = Buffer.from(`Bearer ${this.token}`);
    const given = Buffer.from(header);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const host = req.headers.host;
    if (
      host !== `127.0.0.1:${this.port}` &&
      host !== `localhost:${this.port}`
    ) {
      return this.reply(res, 403);
    }
    if (req.headers.origin !== undefined) return this.reply(res, 403);
    if (!this.authorized(req)) return this.reply(res, 401);
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/mcp') return this.reply(res, 404);
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return this.reply(res, 405);
    }

    const body = await this.readBody(req);
    if (body === undefined) return this.reply(res, 413);
    let message: unknown;
    try {
      message = JSON.parse(body);
    } catch {
      return this.json(res, 400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'parse error' }, // i18n-ignore
      });
    }

    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const ctx = { signal: abort.signal };
    if (Array.isArray(message)) {
      const out = (
        await Promise.all(message.map((m) => handleRpc(this.registry, m, ctx)))
      ).filter((r) => r !== undefined);
      return out.length ? this.json(res, 200, out) : this.reply(res, 202);
    }
    const response = await handleRpc(this.registry, message, ctx);
    return response ? this.json(res, 200, response) : this.reply(res, 202);
  }

  private readBody(req: IncomingMessage): Promise<string | undefined> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          chunks.length = 0;
          resolve(undefined);
          req.resume();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', () => resolve(undefined));
    });
  }

  private reply(res: ServerResponse, status: number): void {
    if (res.headersSent) return;
    res.statusCode = status;
    res.end();
  }

  private json(res: ServerResponse, status: number, payload: unknown): void {
    if (res.headersSent) return;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  }
}
