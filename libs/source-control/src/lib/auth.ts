import type { Account, ProviderId } from './models';

// The device code never appears here: it stays in the main process.
export type AuthChallenge = {
  kind: 'device-code';
  userCode: string;
  verificationUri: string;
  expiresAt: string;
};

export interface Credential {
  provider: ProviderId;
  accessToken: string;
  scopes: string[];
  obtainedAt: string;
}

export interface PendingAuth {
  challenge: AuthChallenge;
  complete(signal?: AbortSignal): Promise<Credential>;
}

export type SourceControlStatus =
  | { state: 'disconnected' }
  | { state: 'connecting'; provider: ProviderId; challenge: AuthChallenge }
  | { state: 'connected'; provider: ProviderId; account: Account }
  | { state: 'error'; provider: ProviderId; message: string };
