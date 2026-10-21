import type { PermissionRequest } from '@ascua/ipc';
import { actFor } from './permission-act';

const request = (tool: string, summary: string): PermissionRequest => ({
  id: 1,
  tool,
  summary,
  input: {},
});

describe('actFor', () => {
  it('asks for AskUserQuestion, whatever the summary says', () => {
    expect(actFor(request('AskUserQuestion', 'rm -rf /'))).toBe('ask');
  });

  it('warns before destructive commands', () => {
    expect(actFor(request('Bash', 'rm -rf dist'))).toBe('warn');
    expect(actFor(request('Bash', 'git push -f origin main'))).toBe('warn');
    expect(actFor(request('Bash', 'git reset --hard HEAD~1'))).toBe('warn');
  });

  it('alerts for ordinary tools', () => {
    expect(actFor(request('Edit', 'src/app.ts'))).toBe('alert');
  });
});
