import type { ChatErrorKind } from './errors';

export type AgentProviderId = 'claude' | 'codex' | 'gemini';

export interface ProviderDescriptor {
  readonly id: AgentProviderId;
  readonly enabled: boolean;
}

/** Multi-provider is v2: only claude is enabled. */
export const PROVIDERS: readonly ProviderDescriptor[] = [
  { id: 'claude', enabled: true },
  { id: 'codex', enabled: false },
  { id: 'gemini', enabled: false },
];

export function isAgentProviderId(value: unknown): value is AgentProviderId {
  return PROVIDERS.some((p) => p.id === value);
}

export type ProviderAuth =
  | {
      provider: AgentProviderId;
      state: 'loggedIn';
      account?: { email?: string; plan?: string };
    }
  | { provider: AgentProviderId; state: 'loggedOut' }
  | { provider: AgentProviderId; state: 'unavailable'; error: ChatErrorKind };

export interface ProviderInfo extends ProviderDescriptor {
  readonly selected: boolean;
}
