import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  const pipe = new RelativeTimePipe();
  const now = Date.parse('2026-01-10T12:00:00Z');

  it('picks the unit', () => {
    expect(pipe.transform(now - 2 * 3600_000, 'en', now)).toBe('2 hours ago');
    expect(pipe.transform(now - 3 * 86400_000, 'en', now)).toBe('3 days ago');
    expect(pipe.transform(now - 5 * 60_000, 'en', now)).toBe('5 minutes ago');
  });

  it('accepts ISO strings and follows the language', () => {
    const iso = new Date(now - 86400_000).toISOString();
    expect(pipe.transform(iso, 'en', now)).toBe('yesterday');
    expect(pipe.transform(iso, 'es', now)).toBe('ayer');
  });

  it('returns empty for invalid input', () => {
    expect(pipe.transform('nope', 'en', now)).toBe('');
    expect(pipe.transform(undefined, 'en', now)).toBe('');
  });
});
