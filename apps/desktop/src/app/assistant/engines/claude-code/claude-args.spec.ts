import { describe, expect, it } from 'vitest';
import { claudeArgs } from './claude-args';
import { personaPrompt } from './persona';

describe('claudeArgs', () => {
  const base = {
    mcpConfig: '/w/mcp.json',
    persona: 'p',
    tools: ['a_b', 'c_d'],
  };

  it('restricts the CLI and never uses --bare', () => {
    const args = claudeArgs(base);
    expect(args).toContain('--restricted');
    expect(args).toContain('--strict-mcp-config');
    expect(args).not.toContain('--bare');
    expect(
      args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2),
    ).toEqual(['--tools', '']);
    expect(args[args.indexOf('--permission-prompts') + 1]).toBe('none');
  });

  it('allows every registry tool, prefixed, and no WebSearch', () => {
    const args = claudeArgs(base);
    expect(args[args.indexOf('--allowedTools') + 1]).toBe(
      'mcp__ascua__a_b,mcp__ascua__c_d',
    );
    expect(args.join(' ')).not.toContain('WebSearch');
  });

  it('adds --resume only with a session', () => {
    expect(claudeArgs(base)).not.toContain('--resume');
    expect(claudeArgs({ ...base, resume: 's1' }).slice(-2)).toEqual([
      '--resume',
      's1',
    ]);
  });
});

describe('personaPrompt', () => {
  it('defaults to the configured language', () => {
    expect(personaPrompt('es')).toContain('use Spanish');
    expect(personaPrompt('en')).toContain('use English');
  });

  it('asks to infer intent and to answer briefly for speech', () => {
    const text = personaPrompt('es');
    expect(text).toMatch(/Infer intent/);
    expect(text).toMatch(/read aloud/);
    expect(text).toMatch(/short plain sentences/);
  });

  it('announces confirmations and the UI guide', () => {
    const text = personaPrompt('es');
    expect(text).toMatch(/confirmation bubble/);
    expect(text).toMatch(/ui_guide/);
    expect(text).toMatch(/window_state/);
  });

  it('is safe as one shell argument', () => {
    expect(personaPrompt('es')).not.toMatch(/["'%&^|<>\n]/);
  });
});
