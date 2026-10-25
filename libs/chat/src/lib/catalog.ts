import type { AgentProviderId } from './provider';

export type ReasoningEffort =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export interface ProviderModel {
  id: string;
  label?: string;
  description?: string;
  efforts: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
  supportsAutoMode?: boolean;
}

export interface ModelCatalog {
  provider: AgentProviderId;
  models: ProviderModel[];
  source: 'live' | 'static';
}

const CLAUDE_EFFORTS: ReasoningEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export const STATIC_MODEL_CATALOGS: Record<AgentProviderId, ModelCatalog> = {
  claude: {
    provider: 'claude',
    source: 'static',
    models: [
      { id: 'opus', label: 'Opus', efforts: CLAUDE_EFFORTS }, // i18n-ignore
      { id: 'sonnet', label: 'Sonnet', efforts: CLAUDE_EFFORTS }, // i18n-ignore
      { id: 'haiku', label: 'Haiku', efforts: [] }, // i18n-ignore
    ],
  },
  codex: { provider: 'codex', source: 'static', models: [] },
  gemini: { provider: 'gemini', source: 'static', models: [] },
};

/** Looks the selection up; an effort the model does not support is dropped. */
export function resolveSelection(
  catalog: ModelCatalog,
  model?: string,
  effort?: ReasoningEffort,
): { model?: ProviderModel; effort?: ReasoningEffort } {
  const found = model ? catalog.models.find((m) => m.id === model) : undefined;
  const ok = found && effort && found.efforts.includes(effort);
  return { model: found, effort: ok ? effort : undefined };
}
