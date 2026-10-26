import { ToolInputError, type Capability } from '@ascua/assistant';
import type { ProjectRepository } from '../../projects/project-repository';

export function projectsCapability(
  repo: Pick<ProjectRepository, 'list' | 'get'>,
): Capability {
  return {
    id: 'projects',
    tools: [
      {
        name: 'projects_list',
        description:
          'Lists the user\'s projects with id, name, folder path and terminal (pista) names. Use it to resolve a project name to its id. Examples: "qué proyectos tengo", "my projects".', // i18n-ignore
        inputSchema: { type: 'object', properties: {} },
        effect: 'read',
        run: async () =>
          (await repo.list()).map((p) => ({
            id: p.id,
            name: p.name,
            path: p.path,
            terminals: p.terminals.map((t) => t.name),
          })),
      },
      {
        name: 'projects_get',
        description:
          'Gets one project with its terminal specs (name, command, folder, port).', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: { projectId: { type: 'string' } },
          required: ['projectId'],
        },
        effect: 'read',
        run: async (input: { projectId: string }) => {
          const project = await repo.get(input.projectId);
          if (!project) {
            throw new ToolInputError(
              `unknown projectId "${input.projectId}"`, // i18n-ignore
            );
          }
          return {
            id: project.id,
            name: project.name,
            path: project.path,
            terminals: project.terminals.map((t) => ({
              id: t.id,
              name: t.name,
              command: t.command,
              cwd: t.cwd,
              port: t.port,
            })),
          };
        },
      },
    ],
  };
}
