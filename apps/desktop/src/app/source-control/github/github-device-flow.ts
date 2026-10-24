import { SourceControlError } from '@ascua/source-control';
import type {
  Credential,
  DeviceAuthorization,
  DeviceAuthorizer,
} from '@ascua/source-control';
import type { FetchFn } from './github-http';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
const SLOW_DOWN_MS = 5000;

export interface GitHubDeviceFlowOptions {
  fetch: FetchFn;
  clientId: string;
  scopes: string[];
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class GitHubDeviceFlow implements DeviceAuthorizer {
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: GitHubDeviceFlowOptions) {
    this.sleep = options.sleep ?? abortableSleep;
    this.now = options.now ?? Date.now;
  }

  private async post(
    url: string,
    body: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.options.fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Ascua',
        },
        body: new URLSearchParams(body).toString(),
        signal,
      });
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw new SourceControlError('network');
    }
    if (!response.ok && response.status >= 500) {
      throw new SourceControlError('network');
    }
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new SourceControlError('unknown');
    }
  }

  private fail(data: Record<string, unknown>): never {
    switch (data['error']) {
      case 'expired_token':
        throw new SourceControlError('codeExpired');
      case 'access_denied':
        throw new SourceControlError('denied');
      case 'device_flow_disabled':
        throw new SourceControlError('unavailable');
      default:
        throw new SourceControlError(
          'unknown',
          undefined,
          String(data['error'] ?? 'unexpected response'), // i18n-ignore
        );
    }
  }

  async start(): Promise<DeviceAuthorization> {
    const data = await this.post(DEVICE_CODE_URL, {
      client_id: this.options.clientId,
      scope: this.options.scopes.join(' '),
    });
    if (data['error']) this.fail(data);
    const { device_code, user_code, verification_uri } = data;
    if (
      typeof device_code !== 'string' ||
      typeof user_code !== 'string' ||
      typeof verification_uri !== 'string'
    ) {
      throw new SourceControlError('unknown');
    }
    return {
      deviceCode: device_code,
      userCode: user_code,
      verificationUri: verification_uri,
      expiresAt: this.now() + Number(data['expires_in'] ?? 900) * 1000,
      intervalMs: Number(data['interval'] ?? 5) * 1000,
    };
  }

  async poll(
    authorization: DeviceAuthorization,
    signal: AbortSignal,
  ): Promise<Credential> {
    let interval = authorization.intervalMs;
    for (;;) {
      await this.sleep(interval, signal);
      if (signal.aborted) throw signal.reason;
      if (this.now() >= authorization.expiresAt) {
        throw new SourceControlError('codeExpired');
      }
      const data = await this.post(
        TOKEN_URL,
        {
          client_id: this.options.clientId,
          device_code: authorization.deviceCode,
          grant_type: GRANT,
        },
        signal,
      );
      const error = data['error'];
      if (error === 'authorization_pending') continue;
      if (error === 'slow_down') {
        interval += SLOW_DOWN_MS;
        continue;
      }
      if (error) this.fail(data);
      const token = data['access_token'];
      if (typeof token !== 'string') throw new SourceControlError('unknown');
      return {
        provider: 'github',
        accessToken: token,
        tokenType: String(data['token_type'] ?? 'bearer'),
        scopes: String(data['scope'] ?? '')
          .split(/[,\s]+/)
          .filter(Boolean),
      };
    }
  }
}
