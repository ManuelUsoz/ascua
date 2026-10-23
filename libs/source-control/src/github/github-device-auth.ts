import type { Credential, PendingAuth } from '../lib/auth';
import { SourceControlError } from '../lib/errors';
import type { FetchLike, SourceControlAuth } from '../lib/ports';
import type {
  GhAccessTokenResponse,
  GhDeviceCodeResponse,
} from './github-types';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const MAX_NETWORK_RETRIES = 3;
const GRANT_TYPE ='urn:ietf:params:oauth:grant-type:device_code';

export interface GitHubDeviceAuthOptions {
  clientId: string;
  scopes?: string[];
  fetch: FetchLike;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

function cancelled(): SourceControlError {
  return new SourceControlError('cancelled', 'github', 'Connection cancelled');
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelled());
    const onAbort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class GitHubDeviceAuth implements SourceControlAuth {
  readonly provider = 'github' as const;

  private readonly clientId: string;
  private readonly scopes: string[];
  private readonly fetchFn: FetchLike;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;

  constructor(opts: GitHubDeviceAuthOptions) {
    this.clientId = opts.clientId;
    this.scopes = opts.scopes ?? ['repo', 'read:user'];
    this.fetchFn = opts.fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? Date.now;
  }

  private async post<T>(url: string, body: Record<string, string>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ascua',
        },
        body: new URLSearchParams(body).toString(),
      });
    } catch {
      throw new SourceControlError('network', 'github', 'GitHub is unreachable');
    }
    if (!res.ok) {
      throw new SourceControlError(
        'unknown',
        'github',
        `GitHub responded with ${res.status}`,
      );
    }
    return (await res.json()) as T;
  }

  async begin(): Promise<PendingAuth> {
    const dc = await this.post<GhDeviceCodeResponse>(DEVICE_CODE_URL, {
      client_id: this.clientId,
      scope: this.scopes.join(' '),
    });
    const deviceCode = dc.device_code;
    const expiresAtMs = this.now() + dc.expires_in * 1000;
    let intervalSec = dc.interval ?? 5;

    return {
      challenge: {
        kind: 'device-code',
        userCode: dc.user_code,
        verificationUri: dc.verification_uri,
        expiresAt: new Date(expiresAtMs).toISOString(),
      },
      complete: async (signal?: AbortSignal): Promise<Credential> => {
        let networkFailures = 0;
        for (;;) {
          if (signal?.aborted) throw cancelled();
          await this.sleep(intervalSec * 1000, signal);
          if (signal?.aborted) throw cancelled();
          if (this.now() >= expiresAtMs) {
            throw new SourceControlError(
              'auth-expired',
              'github',
              'The device code expired',
            );
          }
          let res: GhAccessTokenResponse;
          try {
            res = await this.post<GhAccessTokenResponse>(TOKEN_URL, {
              client_id: this.clientId,
              device_code: deviceCode,
              grant_type: GRANT_TYPE,
            });
          } catch (err) {
            if (
              err instanceof SourceControlError &&
              err.code === 'network' &&
              ++networkFailures <= MAX_NETWORK_RETRIES
            ) {
              continue;
            }
            throw err;
          }
          networkFailures = 0;
          if (res.access_token) {
            return {
              provider: 'github',
              accessToken: res.access_token,
              scopes: (res.scope ?? '').split(',').filter(Boolean),
              obtainedAt: new Date(this.now()).toISOString(),
            };
          }
          switch (res.error) {
            case 'authorization_pending':
              break;
            case 'slow_down':
              intervalSec = res.interval ?? intervalSec + 5;
              break;
            case 'expired_token':
              throw new SourceControlError(
                'auth-expired',
                'github',
                'The device code expired',
              );
            case 'access_denied':
              throw new SourceControlError(
                'auth-denied',
                'github',
                'Access was denied',
              );
            default:
              throw new SourceControlError(
                'unknown',
                'github',
                `GitHub authorization failed${res.error ? `: ${res.error}` : ''}`,
              );
          }
        }
      },
    };
  }
}
