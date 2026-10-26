import { describe, expect, it } from 'vitest';
import { SAB_FEATURE, withFeature } from './chromium-switches';

describe('withFeature', () => {
  it('starts a list from an empty value', () => {
    expect(withFeature('', SAB_FEATURE)).toBe('SharedArrayBuffer');
  });

  it('appends to an existing list', () => {
    expect(withFeature('A,B', SAB_FEATURE)).toBe('A,B,SharedArrayBuffer');
  });

  it('does not duplicate the feature', () => {
    expect(withFeature('A,SharedArrayBuffer', SAB_FEATURE)).toBe(
      'A,SharedArrayBuffer',
    );
  });
});
