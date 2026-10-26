import type { Capability, JsonSchema } from '@ascua/assistant';
import { PROVIDER_IDS, type ProviderId } from '@ascua/source-control';
import type { SourceControlService } from '../../source-control/source-control-service';

const PATCH_CAP = 60_000;

type Service = Pick<
  SourceControlService,
  | 'status'
  | 'listRepositories'
  | 'listPullRequests'
  | 'listBranches'
  | 'listCommits'
  | 'getPullRequestDiff'
>;

interface Base {
  provider?: ProviderId;
  cursor?: string;
}

function schema(
  properties: JsonSchema['properties'],
  required: string[] = [],
): JsonSchema {
  return {
    type: 'object',
    properties: {
      provider: {
        type: 'string',
        enum: PROVIDER_IDS,
        description: 'Defaults to github.', // i18n-ignore
      },
      ...properties,
    },
    required,
  };
}

const REPO = {
  type: 'string',
  description: 'Repository id, "owner/name" for GitHub.', // i18n-ignore
} as const;
const CURSOR = {
  type: 'string',
  description: 'Cursor from a previous page.', // i18n-ignore
} as const;

export function sourceControlCapability(service: Service): Capability {
  const provider = (i: Base): ProviderId => i.provider ?? 'github';
  return {
    id: 'source_control',
    tools: [
      {
        name: 'source_control_status',
        description: 'Tells whether GitHub is connected and which account.', // i18n-ignore
        inputSchema: schema({}),
        effect: 'read',
        run: async (i: Base) => {
          const s = await service.status(provider(i));
          return s.state === 'connected'
            ? { state: s.state, account: s.account.login }
            : { state: s.state };
        },
      },
      {
        name: 'source_control_repositories',
        description:
          'Lists the user\'s repositories. Examples: "mis repos", "my repositories".', // i18n-ignore
        inputSchema: schema({ cursor: CURSOR }),
        effect: 'read',
        run: (i: Base) =>
          service.listRepositories(provider(i), { cursor: i.cursor }),
      },
      {
        name: 'source_control_pull_requests',
        description: 'Lists pull requests of a repository.', // i18n-ignore
        inputSchema: schema(
          {
            repoId: REPO,
            state: { type: 'string', enum: ['open', 'closed', 'all'] },
            branch: { type: 'string', description: 'Source branch filter.' }, // i18n-ignore
            cursor: CURSOR,
          },
          ['repoId'],
        ),
        effect: 'read',
        run: (
          i: Base & {
            repoId: string;
            state?: 'open' | 'closed' | 'all';
            branch?: string;
          },
        ) =>
          service.listPullRequests(provider(i), i.repoId, {
            state: i.state,
            branch: i.branch,
            cursor: i.cursor,
          }),
      },
      {
        name: 'source_control_branches',
        description: 'Lists branches of a repository.', // i18n-ignore
        inputSchema: schema({ repoId: REPO, cursor: CURSOR }, ['repoId']),
        effect: 'read',
        run: (i: Base & { repoId: string }) =>
          service.listBranches(provider(i), i.repoId, { cursor: i.cursor }),
      },
      {
        name: 'source_control_commits',
        description:
          'Lists recent commits of a repository, optionally of one branch.', // i18n-ignore
        inputSchema: schema(
          { repoId: REPO, branch: { type: 'string' }, cursor: CURSOR },
          ['repoId'],
        ),
        effect: 'read',
        run: (i: Base & { repoId: string; branch?: string }) =>
          service.listCommits(provider(i), i.repoId, {
            branch: i.branch,
            cursor: i.cursor,
          }),
      },
      {
        name: 'source_control_pull_request_diff',
        description: 'Gets the changed files and patches of a pull request.', // i18n-ignore
        inputSchema: schema({ repoId: REPO, number: { type: 'integer' } }, [
          'repoId',
          'number',
        ]),
        effect: 'read',
        run: async (i: Base & { repoId: string; number: number }) => {
          const diff = await service.getPullRequestDiff(
            provider(i),
            i.repoId,
            i.number,
          );
          let budget = PATCH_CAP;
          let cut = diff.truncated;
          const files = diff.files.map((f) => {
            if (f.patch === undefined) return f;
            if (f.patch.length <= budget) {
              budget -= f.patch.length;
              return f;
            }
            cut = true;
            const patch = f.patch.slice(0, budget);
            budget = 0;
            return { ...f, patch };
          });
          return { files, truncated: cut };
        },
      },
    ],
  };
}
