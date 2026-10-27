import { ToolInputError, type Capability } from '@ascua/assistant';
import type { Project, TerminalSession } from '@ascua/ipc';
import type { ProjectRepository } from '../../projects/project-repository';
import type { TerminalManager } from '../../terminals/terminal-manager';

const OUTPUT_MAX = 20_000;
const WRITE_MAX = 1000;

const ANSI =
  // eslint-disable-next-line no-control-regex
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;

// C0/C1 controls (newlines included) and the Unicode line/paragraph separators.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\p{Zl}\p{Zp}\p{Cf}]/u;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

function describe(session: TerminalSession, all: Project[]) {
  const project = all.find((p) => p.id === session.projectId);
  const spec = project?.terminals.find((t) => t.id === session.terminalId);
  return {
    project: project?.name,
    name: session.kind === 'pista' ? spec?.name : session.name,
  };
}

function oneLine(text: unknown): string {
  if (typeof text !== 'string' || text.length === 0) {
    throw new ToolInputError('text must be a non-empty string'); // i18n-ignore
  }
  if (text.length > WRITE_MAX) {
    throw new ToolInputError(`text is longer than ${WRITE_MAX} chars`); // i18n-ignore
  }
  if (CONTROL.test(text)) {
    throw new ToolInputError(
      'text must be a single line without control characters or newlines', // i18n-ignore
    );
  }
  return text;
}

const NOT_A_SHELL = 'only shells can be closed, use terminals_stop for pistas'; // i18n-ignore

export function terminalsCapability(
  terminals: Pick<
    TerminalManager,
    | 'list'
    | 'replay'
    | 'start'
    | 'startProject'
    | 'stop'
    | 'openShell'
    | 'closeShell'
    | 'write'
  >,
  projects: Pick<ProjectRepository, 'list' | 'get'>,
): Capability {
  const session = (id: string): TerminalSession => {
    const found = terminals.list().find((s) => s.id === id);
    if (!found) throw new ToolInputError(`unknown terminal "${id}"`); // i18n-ignore
    return found;
  };
  const project = async (projectId: string): Promise<Project> => {
    const found = await projects.get(projectId);
    if (!found) {
      throw new ToolInputError(`unknown projectId "${projectId}"`); // i18n-ignore
    }
    return found;
  };
  const pista = async (projectId: string, terminalId: string) => {
    const p = await project(projectId);
    const spec = p.terminals.find((t) => t.id === terminalId);
    if (!spec) {
      throw new ToolInputError(`unknown terminalId "${terminalId}"`); // i18n-ignore
    }
    return { project: p, spec };
  };
  const named = async (id: string) => {
    const s = session(id);
    const d = describe(s, await projects.list());
    return {
      session: s,
      params: { name: d.name ?? '', project: d.project ?? '' },
    };
  };
  const runningLine = (id: string, text: unknown) => {
    const line = oneLine(text);
    const s = session(id);
    if (s.status !== 'running') {
      throw new ToolInputError(`terminal "${id}" is not running`); // i18n-ignore
    }
    return { line, session: s };
  };

  return {
    id: 'terminals',
    tools: [
      {
        name: 'terminals_list',
        description:
          'Lists the terminals (pistas and shells) with project, name and status running/stopped/failed. Examples: "qué está corriendo", "what is running".', // i18n-ignore
        inputSchema: { type: 'object', properties: {} },
        effect: 'read',
        run: async () => {
          const all = await projects.list();
          return terminals.list().map((s) => ({
            id: s.id,
            projectId: s.projectId,
            kind: s.kind,
            ...describe(s, all),
            status: s.status,
            exitCode: s.exitCode,
          }));
        },
      },
      {
        name: 'terminals_output',
        description:
          'Reads the most recent output of a terminal (id from terminals_list), without color codes.', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            chars: {
              type: 'integer',
              description: `Characters from the end, up to ${OUTPUT_MAX}.`, // i18n-ignore
            },
          },
          required: ['id'],
        },
        effect: 'read',
        run: async (input: { id: string; chars?: number }) => {
          if (!terminals.list().some((s) => s.id === input.id)) {
            throw new ToolInputError(`unknown terminal "${input.id}"`); // i18n-ignore
          }
          const chars = Math.min(Math.max(input.chars ?? 4000, 1), OUTPUT_MAX);
          const { data } = await terminals.replay(input.id);
          const clean = stripAnsi(data);
          return {
            output: clean.slice(-chars),
            truncated: clean.length > chars,
          };
        },
      },
      {
        name: 'terminals_start',
        description:
          'Starts one pista (saved terminal command) of a project. Needs projectId and terminalId from projects_get. The user confirms first. Examples: "levantá el backend", "start the web pista".', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            terminalId: { type: 'string' },
          },
          required: ['projectId', 'terminalId'],
        },
        effect: 'write',
        summarize: async (input: { projectId: string; terminalId: string }) => {
          const { project: p, spec } = await pista(
            input.projectId,
            input.terminalId,
          );
          return {
            params: { project: p.name, pista: spec.name },
            detail: spec.command,
          };
        },
        run: async (input: { projectId: string; terminalId: string }) => {
          await pista(input.projectId, input.terminalId);
          return terminals.start(input.projectId, input.terminalId);
        },
      },
      {
        name: 'terminals_start_all',
        description:
          'Starts every pista of a project at once. The user confirms first. Examples: "levantá todo", "start everything".', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string' } },
          required: ['projectId'],
        },
        effect: 'write',
        summarize: async (input: { projectId: string }) => {
          const p = await project(input.projectId);
          return {
            params: { project: p.name, count: String(p.terminals.length) },
            detail: p.terminals
              .map((t) => `${t.name}: ${t.command}`)
              .join('\n'),
          };
        },
        run: async (input: { projectId: string }) => {
          await project(input.projectId);
          return terminals.startProject(input.projectId);
        },
      },
      {
        name: 'terminals_stop',
        description:
          'Stops a running terminal (pista or shell), id from terminals_list. The user confirms first. Examples: "pará el backend", "stop it".', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        effect: 'write',
        summarize: async (input: { id: string }) => ({
          params: (await named(input.id)).params,
        }),
        run: async (input: { id: string }) => {
          const s = session(input.id);
          terminals.stop(s.projectId, s.terminalId);
          return { stopped: s.id };
        },
      },
      {
        name: 'terminals_open_shell',
        description:
          'Opens a new temporary shell at the project root and returns its id and name. The user confirms first. Examples: "abrí una terminal", "open a shell".', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string' } },
          required: ['projectId'],
        },
        effect: 'write',
        summarize: async (input: { projectId: string }) => ({
          params: { project: (await project(input.projectId)).name },
        }),
        run: async (input: { projectId: string }) => {
          await project(input.projectId);
          const s = await terminals.openShell(input.projectId);
          return { id: s.id, name: s.name, status: s.status };
        },
      },
      {
        name: 'terminals_close_shell',
        description:
          'Closes a temporary shell (not a pista), id from terminals_list. The user confirms first. Examples: "cerrá la shell", "close that shell".', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        effect: 'write',
        summarize: async (input: { id: string }) => {
          const n = await named(input.id);
          if (n.session.kind !== 'shell') throw new ToolInputError(NOT_A_SHELL);
          return { params: n.params };
        },
        run: async (input: { id: string }) => {
          const s = session(input.id);
          if (s.kind !== 'shell') throw new ToolInputError(NOT_A_SHELL);
          terminals.closeShell(s.projectId, s.terminalId);
          return { closed: s.id };
        },
      },
      {
        name: 'terminals_write',
        description:
          'Types ONE line into a running terminal and presses Enter. Up to 1000 chars, no newlines or control characters. The user sees the exact text and confirms. Examples: "escribí npm test en la shell", "run ls there".', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            text: {
              type: 'string',
              description: 'One line, up to 1000 chars.',
            }, // i18n-ignore
          },
          required: ['id', 'text'],
        },
        effect: 'write',
        summarize: async (input: { id: string; text: string }) => {
          const { line } = runningLine(input.id, input.text);
          const n = await named(input.id);
          return { params: n.params, detail: line };
        },
        run: async (input: { id: string; text: string }) => {
          const { line, session: s } = runningLine(input.id, input.text);
          terminals.write(s.id, line + '\r');
          return { written: line.length };
        },
      },
    ],
  };
}
