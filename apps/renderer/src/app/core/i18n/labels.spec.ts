import { UI_LABEL_KEYS } from '@ascua/ipc';
import { describe, expect, it, vi } from 'vitest';
import { resolveLabels } from './labels';

describe('resolveLabels', () => {
  it.each(['es', 'en'])('resolves every UI label key in %s', async (lang) => {
    const labels = await resolveLabels(UI_LABEL_KEYS, lang);
    for (const key of UI_LABEL_KEYS) {
      expect(labels[key], key).toBeTruthy();
    }
  });

  it('reads scoped keys from their scope and loads each catalog once', async () => {
    const root = vi.fn(async () => ({ nav: { files: 'Archivos' } }));
    const scope = vi.fn(async () => ({
      page: { edit: 'Editar', stopAll: 'X' },
    }));
    const labels = await resolveLabels(
      ['nav.files', 'projects.page.edit', 'projects.page.stopAll'],
      'es',
      { es: root, 'projects/es': scope },
    );
    expect(labels).toEqual({
      'nav.files': 'Archivos',
      'projects.page.edit': 'Editar',
      'projects.page.stopAll': 'X',
    });
    expect(root).toHaveBeenCalledTimes(1);
    expect(scope).toHaveBeenCalledTimes(1);
  });

  it('leaves out keys that do not exist', async () => {
    const labels = await resolveLabels(['nav.files'], 'es', {
      es: async () => ({}),
    });
    expect(labels).toEqual({});
  });
});
