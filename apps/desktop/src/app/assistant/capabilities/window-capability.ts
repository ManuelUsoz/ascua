import {
  NAVIGATE_SCREENS,
  PROJECT_TABS,
  type NavigateScreen,
  type NavigateTarget,
  type ProjectTab,
  type UiContext,
} from '@ascua/ipc';
import { ToolInputError, type Capability } from '@ascua/assistant';
import type { ProjectRepository } from '../../projects/project-repository';

/** The room only: no OS minimize/restore. */
export interface RoomControl {
  isOpen(): boolean;
  open(): void;
  collapse(): void;
  navigate(target: NavigateTarget): void;
}

export interface WindowCapabilityDeps {
  room: RoomControl;
  projects: Pick<ProjectRepository, 'get'>;
  /** Last route the renderer reported. */
  context: { get(): UiContext };
}

interface NavigateInput {
  screen: NavigateScreen;
  projectId?: string;
  tab?: ProjectTab;
}

export function windowCapability({
  room,
  projects,
  context,
}: WindowCapabilityDeps): Capability {
  return {
    id: 'window',
    tools: [
      {
        name: 'window_state',
        description:
          'Tells whether the Ascua room (the big workspace) is open or collapsed to the avatar, and the current screen (screen, projectId, tab). ' + // i18n-ignore
          'Use it when unsure before acting. Examples: "¿estás abierta?", "is the room open?", "¿dónde estoy?".', // i18n-ignore
        inputSchema: { type: 'object', properties: {} },
        effect: 'read',
        run: async () => {
          const route = context.get().route;
          return {
            open: room.isOpen(),
            screen: route?.screen,
            projectId:
              route?.screen === 'project' ? route.projectId : undefined,
            tab: route?.screen === 'project' ? route.tab : undefined,
          };
        },
      },
      {
        name: 'window_open_room',
        description:
          'Opens the Ascua room so the user sees everything. Call it when the user wants to work or see the app, ' + // i18n-ignore
          'however they phrase it. Examples: "muéstrame todo", "ábrete", "quiero trabajar", "show me everything", "open up". ' + // i18n-ignore
          'Does nothing if already open.', // i18n-ignore
        inputSchema: { type: 'object', properties: {} },
        effect: 'write',
        confirm: false,
        run: async () => {
          const wasOpen = room.isOpen();
          if (!wasOpen) room.open();
          return { open: true, changed: !wasOpen };
        },
      },
      {
        name: 'window_collapse_room',
        description:
          'Collapses the Ascua room back to the small avatar so the user sees their desktop. Call it when the user is done or wants the screen back, ' + // i18n-ignore
          'however they phrase it. Examples: "ya terminé", "ya terminé por hoy", "déjame ver el escritorio", "minimízate", "that\'s all for now", "let me see my desktop". ' + // i18n-ignore
          'Does nothing if already collapsed.', // i18n-ignore
        inputSchema: { type: 'object', properties: {} },
        effect: 'write',
        confirm: false,
        run: async () => {
          const wasOpen = room.isOpen();
          if (wasOpen) room.collapse();
          return { open: false, changed: wasOpen };
        },
      },
      {
        name: 'window_navigate',
        description:
          'Takes the user to a screen of Ascua, opening the room first if needed. Screens: projects, project (needs projectId, optional tab terminals or files), repositories, settings, assistant. ' + // i18n-ignore
          'Examples: "llévame a los repos", "abre los archivos de <proyecto>", "las terminales de X", "abre los ajustes", "go to settings". ' + // i18n-ignore
          'To go to a project given by name, call projects_list first and use its id.', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: {
            screen: {
              type: 'string',
              enum: NAVIGATE_SCREENS,
              description: 'Target screen.', // i18n-ignore
            },
            projectId: {
              type: 'string',
              description: 'Project id, only for screen "project".', // i18n-ignore
            },
            tab: {
              type: 'string',
              enum: PROJECT_TABS,
              description: 'Project tab, only for screen "project".', // i18n-ignore
            },
          },
          required: ['screen'],
        },
        effect: 'write',
        confirm: false,
        run: async (input: NavigateInput) => {
          let target: NavigateTarget;
          if (input.screen === 'project') {
            if (!input.projectId) {
              throw new ToolInputError(
                'projectId is required for screen "project"', // i18n-ignore
              );
            }
            if (!(await projects.get(input.projectId))) {
              throw new ToolInputError(
                `unknown projectId "${input.projectId}"`, // i18n-ignore
              );
            }
            target = { screen: 'project', projectId: input.projectId };
            if (input.tab) target.tab = input.tab;
          } else {
            if (input.projectId !== undefined) {
              throw new ToolInputError(
                'projectId is only valid for screen "project"', // i18n-ignore
              );
            }
            if (input.tab !== undefined) {
              throw new ToolInputError(
                'tab is only valid for screen "project"', // i18n-ignore
              );
            }
            target = { screen: input.screen };
          }
          const opened = !room.isOpen();
          if (opened) room.open();
          room.navigate(target);
          return { opened, screen: input.screen };
        },
      },
    ],
  };
}
