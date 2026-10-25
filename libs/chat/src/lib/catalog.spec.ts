import { describe, expect, it } from 'vitest';
import { resolveSelection, STATIC_MODEL_CATALOGS } from './catalog';
import { toPermissionMode } from './model';

const claude = STATIC_MODEL_CATALOGS.claude;

describe('resolveSelection', () => {
  it('keeps a supported effort', () => {
    const r = resolveSelection(claude, 'opus', 'high');
    expect(r.model?.id).toBe('opus');
    expect(r.effort).toBe('high');
  });

  it('clamps an unsupported effort', () => {
    expect(resolveSelection(claude, 'haiku', 'high').effort).toBeUndefined();
    expect(resolveSelection(claude, 'opus', 'minimal').effort).toBeUndefined();
  });

  it('returns nothing for an unknown or missing model', () => {
    expect(resolveSelection(claude, 'nope', 'high')).toEqual({
      model: undefined,
      effort: undefined,
    });
    expect(resolveSelection(claude).model).toBeUndefined();
  });
});

describe('toPermissionMode', () => {
  it('migrates legacy values', () => {
    expect(toPermissionMode('manual')).toBe('supervised');
    expect(toPermissionMode('auto')).toBe('fullAccess');
  });

  it('passes valid values and defaults unknown', () => {
    expect(toPermissionMode('acceptEdits')).toBe('acceptEdits');
    expect(toPermissionMode('supervised')).toBe('supervised');
    expect(toPermissionMode('x')).toBe('fullAccess');
    expect(toPermissionMode(undefined)).toBe('fullAccess');
  });
});
