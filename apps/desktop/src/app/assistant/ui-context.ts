import {
  NAVIGATE_SCREENS,
  PROJECT_TABS,
  UI_LABEL_KEYS,
  type NavigateScreen,
  type NavigateTarget,
  type ProjectTab,
  type UiContext,
  type UiLabelKey,
  type UiLabels,
} from '@ascua/ipc';

const LABEL_KEYS: ReadonlySet<string> = new Set(UI_LABEL_KEYS);
const MAX_LABEL = 200;
const MAX_ID = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanLabels(raw: unknown): UiLabels {
  const out: UiLabels = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (
      LABEL_KEYS.has(key) &&
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= MAX_LABEL
    ) {
      out[key as UiLabelKey] = value;
    }
  }
  return out;
}

function cleanRoute(raw: unknown): NavigateTarget | undefined {
  if (!isRecord(raw)) return undefined;
  const screen = raw['screen'];
  if (!NAVIGATE_SCREENS.includes(screen as NavigateScreen)) return undefined;
  if (screen !== 'project') {
    return { screen: screen as Exclude<NavigateScreen, 'project'> };
  }
  const projectId = raw['projectId'];
  if (
    typeof projectId !== 'string' ||
    projectId.length === 0 ||
    projectId.length > MAX_ID
  ) {
    return undefined;
  }
  const tab = raw['tab'];
  if (tab === undefined) return { screen: 'project', projectId };
  if (!PROJECT_TABS.includes(tab as ProjectTab)) return undefined;
  return { screen: 'project', projectId, tab: tab as ProjectTab };
}

/** What the renderer last told main about its UI; input is untrusted. */
export class UiContextStore {
  private context: UiContext = { labels: {} };

  set(raw: unknown): void {
    if (!isRecord(raw)) return;
    this.context = {
      labels: cleanLabels(raw['labels']),
      route: cleanRoute(raw['route']),
    };
  }

  get(): UiContext {
    return this.context;
  }
}
