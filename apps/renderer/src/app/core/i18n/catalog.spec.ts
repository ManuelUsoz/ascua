import {
  COMMON_ERROR_CODES,
  FILE_ERROR_CODES,
  PROJECT_ERROR_CODES,
  TERMINAL_ERROR_CODES,
} from '@ascua/ipc';
import type { Translation } from '@jsverse/transloco';
import { CATALOGS } from './loader';

function flatten(tree: Translation, prefix = ''): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      Object.assign(flat, flatten(value as Translation, path));
    } else {
      flat[path] = value;
    }
  }
  return flat;
}

/** `projects/es` -> scope `projects`, language `es`; `es` -> root. */
const scopes = [
  ...new Set(
    Object.keys(CATALOGS).map((path) => path.split('/').slice(0, -1).join('/')),
  ),
];

describe('i18n catalogs', () => {
  const load = async (scope: string, lang: string) => {
    const path = scope ? `${scope}/${lang}` : lang;
    const loader = CATALOGS[path];
    expect(loader, `catalog ${path} exists`).toBeDefined();
    return flatten(await loader());
  };

  it.each(scopes)(
    'scope "%s" has es and en with the same keys',
    async (scope) => {
      const es = await load(scope, 'es');
      const en = await load(scope, 'en');
      expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    },
  );

  it.each(scopes)('scope "%s" has no empty values', async (scope) => {
    for (const lang of ['es', 'en']) {
      const flat = await load(scope, lang);
      for (const [key, value] of Object.entries(flat)) {
        expect(
          typeof value === 'string' && value.trim() !== '',
          `${scope || 'root'}/${lang} ${key}`,
        ).toBe(true);
      }
    }
  });

  it('translates every error code in both languages', async () => {
    const codes: readonly string[] = [
      ...COMMON_ERROR_CODES,
      ...PROJECT_ERROR_CODES,
      ...TERMINAL_ERROR_CODES,
      ...FILE_ERROR_CODES,
    ];
    for (const lang of ['es', 'en']) {
      const flat = await load('', lang);
      for (const code of codes) {
        expect(
          flat[`errors.${code}`],
          `errors.${code} (${lang})`,
        ).toBeDefined();
      }
    }
  });
});
