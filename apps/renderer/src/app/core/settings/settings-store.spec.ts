import { TestBed } from '@angular/core/testing';
import type { AscuaApi, Settings } from '@ascua/ipc';
import { TranslocoService } from '@jsverse/transloco';
import { ASCUA_API } from '../bridge/ascua-api';
import { i18nTesting } from '../../testing/i18n';
import { SettingsStore } from './settings-store';

describe('SettingsStore', () => {
  let changed: (settings: Settings) => void;
  const api = {
    getSettings: vi.fn(async (): Promise<Settings> => ({ language: 'en' })),
    updateSettings: vi.fn(
      async (patch: Partial<Settings>): Promise<Settings> => ({
        language: patch.language ?? 'es',
      }),
    ),
    onSettingsChanged: vi.fn((callback: (settings: Settings) => void) => {
      changed = callback;
      return () => undefined;
    }),
  } satisfies Partial<AscuaApi>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [i18nTesting('es')],
      providers: [{ provide: ASCUA_API, useValue: api }],
    });
  });

  it('applies the language main reports on init', async () => {
    const store = TestBed.inject(SettingsStore);
    await store.init();
    expect(store.language()).toBe('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('follows onSettingsChanged', async () => {
    const store = TestBed.inject(SettingsStore);
    await store.init();
    changed({ language: 'es' });
    await Promise.resolve();
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('es');
    expect(store.language()).toBe('es');
  });

  it('sends the chosen language to main', async () => {
    const store = TestBed.inject(SettingsStore);
    await store.setLanguage('en');
    expect(api.updateSettings).toHaveBeenCalledWith({ language: 'en' });
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
  });
});
