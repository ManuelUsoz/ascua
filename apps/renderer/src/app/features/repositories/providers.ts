export interface ProviderOption {
  /** Wider than ProviderId: the disabled providers have no adapter yet. */
  readonly id: string;
  readonly name: string;
  readonly mono: string;
  readonly host: string;
  readonly verifyHost: string;
  readonly available: boolean;
}

// Brand names are not translatable.
export const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  {
    id: 'github',
    name: 'GitHub', // i18n-ignore
    mono: 'GH',
    host: 'github.com',
    verifyHost: 'github.com/login/device',
    available: true,
  },
  {
    id: 'gitlab',
    name: 'GitLab', // i18n-ignore
    mono: 'GL',
    host: 'gitlab.com',
    verifyHost: 'gitlab.com',
    available: false,
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket', // i18n-ignore
    mono: 'BB',
    host: 'bitbucket.org',
    verifyHost: 'bitbucket.org',
    available: false,
  },
  {
    id: 'azure',
    name: 'Azure DevOps', // i18n-ignore
    mono: 'AZ',
    host: 'dev.azure.com',
    verifyHost: 'dev.azure.com',
    available: false,
  },
];

export function termKey(id: string): string {
  return `repositories.term.${id}`;
}
