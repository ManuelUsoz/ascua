import { ToolInputError, type Capability } from '@ascua/assistant';
import { FileAccessError, type ProjectFiles } from '../../files/project-files';

const TEXT_CAP = 60_000;
const SEARCH_MAX = 200;

/** Access refusals (unknown project, path outside) are the model's to fix. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof FileAccessError) {
      throw new ToolInputError(`file access refused: ${error.code}`); // i18n-ignore
    }
    throw error;
  }
}

export function filesCapability(
  files: Pick<ProjectFiles, 'list' | 'index' | 'read'>,
): Capability {
  return {
    id: 'files',
    tools: [
      {
        name: 'files_list_dir',
        description:
          'Lists the entries of a folder inside a project (dir is project-relative, empty = root).', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            dir: { type: 'string' },
          },
          required: ['projectId'],
        },
        effect: 'read',
        run: (input: { projectId: string; dir?: string }) =>
          guarded(() => files.list(input.projectId, input.dir ?? '')),
      },
      {
        name: 'files_search',
        description:
          'Finds project files whose path contains a text (case-insensitive). Example: "dónde está el package.json".', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            query: { type: 'string' },
            limit: {
              type: 'integer',
              description: `Max results, up to ${SEARCH_MAX}.`, // i18n-ignore
            },
          },
          required: ['projectId', 'query'],
        },
        effect: 'read',
        run: (input: { projectId: string; query: string; limit?: number }) =>
          guarded(async () => {
            const limit = Math.min(Math.max(input.limit ?? 50, 1), SEARCH_MAX);
            const needle = input.query.toLowerCase();
            const index = await files.index(input.projectId);
            const matches = index.files.filter((f) =>
              f.toLowerCase().includes(needle),
            );
            return {
              files: matches.slice(0, limit),
              more: matches.length > limit,
              truncated: index.truncated,
            };
          }),
      },
      {
        name: 'files_read',
        description:
          'Reads a text file of a project. Long files are cut; binary or very large files return only kind and size.', // i18n-ignore
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            path: { type: 'string' },
          },
          required: ['projectId', 'path'],
        },
        effect: 'read',
        run: (input: { projectId: string; path: string }) =>
          guarded(async () => {
            const content = await files.read(input.projectId, input.path);
            if (content.kind !== 'text') {
              return { kind: content.kind, size: content.size };
            }
            return {
              kind: 'text',
              size: content.size,
              text: content.text.slice(0, TEXT_CAP),
              truncated: content.text.length > TEXT_CAP,
            };
          }),
      },
    ],
  };
}
