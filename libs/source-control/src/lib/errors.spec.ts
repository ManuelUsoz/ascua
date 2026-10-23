import { describe, expect, it } from 'vitest';
import { SourceControlError, isSourceControlError } from './errors';

describe('SourceControlError', () => {
  it('carries code, provider, message and name', () => {
    const err = new SourceControlError('not-found', 'github', 'missing');
    expect(err.code).toBe('not-found');
    expect(err.provider).toBe('github');
    expect(err.message).toBe('missing');
    expect(err.name).toBe('SourceControlError');
    expect(err).toBeInstanceOf(Error);
  });

  it('is recognised by the guard', () => {
    expect(isSourceControlError(new SourceControlError('unknown', 'github', 'x'))).toBe(true);
    expect(isSourceControlError(new Error('x'))).toBe(false);
    expect(isSourceControlError(null)).toBe(false);
  });
});
