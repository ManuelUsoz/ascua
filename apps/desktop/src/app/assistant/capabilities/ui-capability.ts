import { ToolInputError, type Capability } from '@ascua/assistant';
import type { UiContext, UiLabelKey } from '@ascua/ipc';

type Guide = Record<string, (l: (key: UiLabelKey) => string) => string[]>;

/** Model-facing guide lines; labels are the live ones the user sees. */
const UI_GUIDE: Guide = {
  navigation: (l) => [
    // i18n-ignore
    `The left rail switches screens: ${l('nav.projects')}, ${l('nav.repositories')}, ${l('nav.assistant')} and ${l('nav.settings')}.`,
    // i18n-ignore
    `Inside a project there are two tabs: ${l('nav.terminals')} and ${l('nav.files')}.`,
    // i18n-ignore
    `The room bar has "${l('room.minimize')}" (back to the avatar) and "${l('room.close')}".`,
    'You can take the user there yourself with window_navigate.', // i18n-ignore
  ],
  projects: (l) => [
    // i18n-ignore
    `${l('side.newProject')} (side panel) creates a project: pick its folder and name it.`,
    // i18n-ignore
    `In a project header: "${l('projects.page.edit')}" edits it, "+ ${l('projects.page.addPista')}" adds a saved pista, "+ ${l('projects.page.addTerminal')}" opens a temporary shell and "${l('projects.page.stopAll')}" stops everything.`,
    // i18n-ignore
    `"${l('side.startAll')}" in the side panel starts every pista of the project at once.`,
  ],
  terminals: (l) => [
    // i18n-ignore
    `Open the project and pick the ${l('nav.terminals')} tab: each pista and shell is a terminal there.`,
    // i18n-ignore
    `To add a terminal: the "+ ${l('projects.page.addTerminal')}" button in the project header opens a temporary shell that is not saved.`,
    // i18n-ignore
    `To add a saved pista: "+ ${l('projects.page.addPista')}" asks for ${l('terminals.pista.name')}, ${l('terminals.pista.port')}, ${l('terminals.pista.command')} and ${l('terminals.pista.folder')} (inside the project).`,
    // i18n-ignore
    `"${l('side.startAll')}" in the side panel starts all pistas; "${l('projects.page.stopAll')}" stops them.`,
  ],
  files: (l) => [
    // i18n-ignore
    `The ${l('nav.files')} tab of a project shows its file tree, a filter box and an editor (Ctrl+S saves).`,
  ],
  repositories: (l) => [
    // i18n-ignore
    `${l('nav.repositories')}: first press "${l('repositories.disconnected.connect')}" and enter the device code on GitHub.`,
    // i18n-ignore
    'Then the flow is: repositories, then pull requests and commits of one, then the diff of a pull request.',
  ],
  settings: (l) => [
    // i18n-ignore
    `${l('nav.settings')} has the ${l('settings.language.title')} (Spanish or English) and the ${l('settings.voice.title')} section.`,
  ],
  voice: (l) => [
    // i18n-ignore
    `${l('nav.settings')} > ${l('settings.voice.title')}: "${l('settings.voice.enabled')}" turns talking on, "${l('settings.voice.autoSpeak')}" makes Ascua answer aloud and "${l('settings.voice.style')}" picks the voice.`,
    // i18n-ignore
    `"${l('settings.voice.prepare')}" downloads the voice models once; voice needs them before it works.`,
    'The user holds push-to-talk to speak and releases it to send.', // i18n-ignore
  ],
  avatar: () => [
    'Dragging the avatar moves it to another place or corner.', // i18n-ignore
    'Double click on the avatar opens the room.', // i18n-ignore
    'Holding the avatar for about 450 ms talks to Ascua.', // i18n-ignore
    'In the open room, holding Ctrl+Space talks to Ascua.', // i18n-ignore
  ],
  assistant: (l) => [
    // i18n-ignore
    `${l('nav.assistant')} is the chat with Ascua. Changes such as starting terminals show a bubble with "${l('bubble.approve')}" and "${l('bubble.reject')}".`,
  ],
};

const TOPICS = Object.keys(UI_GUIDE);

export function uiCapability(context: { get(): UiContext }): Capability {
  return {
    id: 'ui',
    tools: [
      {
        name: 'ui_guide',
        description:
          'Explains where screens and buttons are in Ascua, with the exact labels the user sees. Use it to guide the user step by step instead of guessing. ' + // i18n-ignore
          `Topics: ${TOPICS.join(', ')}; omit topic for everything. ` + // i18n-ignore
          'Examples: "¿dónde agrego una terminal?", "cómo conecto GitHub", "where are the settings".', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              enum: TOPICS,
              description: 'Area of the UI.', // i18n-ignore
            },
          },
        },
        effect: 'read',
        run: async (input: { topic?: string }) => {
          const topic = input?.topic;
          if (topic !== undefined && !TOPICS.includes(topic)) {
            throw new ToolInputError(`unknown topic "${topic}"`); // i18n-ignore
          }
          const { labels } = context.get();
          const l = (key: UiLabelKey): string => labels[key] ?? key;
          const names = topic === undefined ? TOPICS : [topic];
          return Object.fromEntries(names.map((n) => [n, UI_GUIDE[n](l)]));
        },
      },
    ],
  };
}
