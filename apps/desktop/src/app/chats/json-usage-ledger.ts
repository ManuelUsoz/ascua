import {
  addUsage,
  EMPTY_USAGE,
  type UsageEntry,
  type UsageLedger,
  type UsageQuery,
  type UsageTotals,
} from '@ascua/chat';
import { ProjectJsonFiles } from './project-json-files';

const matches = (entry: UsageEntry, query: UsageQuery): boolean =>
  (query.sessionId === undefined || entry.sessionId === query.sessionId) &&
  (query.provider === undefined || entry.provider === query.provider) &&
  (query.since === undefined || entry.at >= query.since);

export class JsonUsageLedger implements UsageLedger {
  private readonly files: ProjectJsonFiles<UsageEntry>;

  constructor(dir: string) {
    this.files = new ProjectJsonFiles(dir, 'entries');
  }

  async record(entry: UsageEntry): Promise<void> {
    await this.files.update(entry.projectId, (entries) => ({
      items: [...entries, entry],
    }));
  }

  async entries(query: UsageQuery): Promise<UsageEntry[]> {
    if (query.projectId === undefined) return [];
    return (await this.files.read(query.projectId)).filter((entry) =>
      matches(entry, query),
    );
  }

  async totals(query: UsageQuery): Promise<UsageTotals> {
    const entries = await this.entries(query);
    let usage = { ...EMPTY_USAGE };
    for (const entry of entries) usage = addUsage(usage, entry.usage);
    return { usage, turns: entries.length };
  }
}
