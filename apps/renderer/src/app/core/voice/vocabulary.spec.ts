import type { Project } from '@ascua/ipc';
import { voiceVocabulary } from './vocabulary';

const project = (name: string, pistas: string[]): Project => ({
  id: name,
  name,
  path: '/p',
  terminals: pistas.map((n) => ({ id: n, name: n, command: 'x' })),
});

describe('voiceVocabulary', () => {
  it('lists the app, projects, pistas, labels and fixed terms once', () => {
    const out = voiceVocabulary(
      [project('Mi API', ['web', 'db']), project('Blog', ['web'])],
      { 'nav.terminals': 'Terminal' },
    );
    expect(out.split(', ')).toEqual([
      'Ascua',
      'Mi API',
      'web',
      'db',
      'Blog',
      'Terminal',
      'GitHub',
      'PR',
    ]);
  });

  it('caps the length', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      project(`proyecto-${i}`, []),
    );
    expect(voiceVocabulary(many, {}).length).toBeLessThanOrEqual(600);
  });
});
