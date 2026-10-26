import {
  ChatError,
  PROVIDERS,
  type AgentProvider,
  type AgentProviderId,
  type ProviderInfo,
} from '@ascua/chat';

export interface ChatSettings {
  get(): Promise<{ chatProvider?: AgentProviderId }>;
  update(patch: { chatProvider?: AgentProviderId }): Promise<unknown>;
}

export interface ProviderRegistryOptions {
  providers: Partial<Record<AgentProviderId, AgentProvider>>;
  settings: ChatSettings;
}

export class ProviderRegistry {
  constructor(private readonly options: ProviderRegistryOptions) {}

  async list(): Promise<ProviderInfo[]> {
    const { chatProvider } = await this.options.settings.get();
    return PROVIDERS.map((p) => ({
      id: p.id,
      enabled: p.enabled && !!this.options.providers[p.id],
      selected: p.id === chatProvider,
    }));
  }

  get(id: AgentProviderId): AgentProvider | undefined {
    return this.options.providers[id];
  }

  async select(id: AgentProviderId): Promise<void> {
    const provider = this.options.providers[id];
    const descriptor = PROVIDERS.find((p) => p.id === id);
    if (!provider || !descriptor?.enabled) {
      throw new ChatError('providerDisabled');
    }
    const auth = await provider.authStatus();
    if (auth.state !== 'loggedIn') throw new ChatError('authRequired');
    await this.options.settings.update({ chatProvider: id });
  }

  async current(): Promise<AgentProvider> {
    const { chatProvider } = await this.options.settings.get();
    const provider = chatProvider && this.options.providers[chatProvider];
    if (!provider) throw new ChatError('providerNotConfigured');
    return provider;
  }
}
