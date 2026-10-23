import { describe, expect, it } from 'vitest';
import { initialLanguage } from './initial-language';

describe('initialLanguage', () => {
  it('maps supported regional tags to their base language', () => {
    expect(initialLanguage(['es-AR'], 'en-US')).toBe('es');
    expect(initialLanguage(['en-GB'], 'es')).toBe('en');
  });

  it('falls back to Spanish for unsupported languages', () => {
    expect(initialLanguage(['fr-FR'], 'fr')).toBe('es');
  });

  it('uses the locale when no language is preferred', () => {
    expect(initialLanguage([], 'en-US')).toBe('en');
    expect(initialLanguage([], '')).toBe('es');
  });
});
