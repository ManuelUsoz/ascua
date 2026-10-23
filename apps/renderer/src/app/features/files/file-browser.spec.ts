import { TestBed } from '@angular/core/testing';
import type { AscuaApi } from '@ascua/ipc';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { UnsavedChanges } from '../../core/unsaved/unsaved-changes';
import { FileBrowser } from './file-browser';

describe('FileBrowser index', () => {
  it('retries after a failed index and strips the IPC wrapper', async () => {
    const fileIndex = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Error invoking remote method 'ascua:files:index': Error: Sin permiso para leer el archivo."),
      )
      .mockResolvedValueOnce({ files: ['a.ts'], truncated: false });
    const api = { listDir: vi.fn().mockResolvedValue([]), fileIndex } as unknown as AscuaApi;
    TestBed.configureTestingModule({
      providers: [FileBrowser, { provide: ASCUA_API, useValue: api }],
    });
    const browser = TestBed.inject(FileBrowser);
    browser.load('p');

    await browser.ensureIndex();
    expect(browser.index()).toBeUndefined();
    expect(browser.indexError()).toBe('Sin permiso para leer el archivo.');

    await browser.ensureIndex();
    expect(browser.index()).toEqual({ files: ['a.ts'], truncated: false });
    expect(browser.indexError()).toBeUndefined();
    expect(fileIndex).toHaveBeenCalledTimes(2);
  });
});

describe('FileBrowser editing', () => {
  const text = (t: string, version: string) => ({ kind: 'text', text: t, size: t.length, version, openable: true, editable: true });

  function setup(extra: Record<string, unknown> = {}) {
    const api = {
      listDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn(async (_p: string, path: string) => text(`body ${path}`, `v-${path}`)),
      writeFile: vi.fn().mockResolvedValue({ ok: true, version: 'v2', size: 3 }),
      revealFile: vi.fn().mockResolvedValue(undefined),
      ...extra,
    };
    TestBed.configureTestingModule({
      providers: [FileBrowser, { provide: ASCUA_API, useValue: api as unknown as AscuaApi }],
    });
    const browser = TestBed.inject(FileBrowser);
    browser.load('p');
    return { api, browser, unsaved: TestBed.inject(UnsavedChanges) };
  }

  it('save updates the version and keeps loadId', async () => {
    const { api, browser } = setup();
    await browser.open('a.ts');
    const first = browser.baseline();
    browser.setDirty(true);
    await browser.save('new');
    expect(api.writeFile).toHaveBeenCalledWith('p', 'a.ts', 'new', 'v-a.ts');
    expect(browser.baseline()).toMatchObject({ text: 'new', version: 'v2', loadId: first?.loadId });
    expect(browser.dirty()).toBe(false);
  });

  it('conflict then overwrite sends no version', async () => {
    const { api, browser } = setup();
    api.writeFile.mockResolvedValueOnce({ ok: false, conflict: true });
    await browser.open('a.ts');
    browser.setDirty(true);
    await browser.save('new');
    expect(browser.conflict()).toBe(true);
    await browser.save('new', true);
    expect(api.writeFile).toHaveBeenLastCalledWith('p', 'a.ts', 'new', undefined);
    expect(browser.conflict()).toBe(false);
  });

  it('drops a stale save after opening another file', async () => {
    let release: (v: unknown) => void = () => undefined;
    const { browser } = setup({
      writeFile: vi.fn(() => new Promise((r) => (release = r))),
    });
    await browser.open('a.ts');
    browser.setDirty(true);
    const saving = browser.save('new');
    await browser.open('b.ts', { force: true });
    release({ ok: true, version: 'v9', size: 1 });
    await saving;
    expect(browser.baseline()).toMatchObject({ path: 'b.ts', version: 'v-b.ts' });
  });

  it('waits for the prompt before leaving a dirty file', async () => {
    const { browser, unsaved } = setup();
    await browser.open('a.ts');
    browser.setDirty(true);
    const opening = browser.open('b.ts');
    expect(unsaved.prompt()).toBe('a.ts');
    unsaved.answer(false);
    await opening;
    expect(browser.selected()).toBe('a.ts');
    expect(browser.dirty()).toBe(true);
  });

  it('discarding opens the next file and resets dirty there', async () => {
    const { browser, unsaved } = setup();
    await browser.open('a.ts');
    browser.setDirty(true);
    const opening = browser.open('b.ts');
    unsaved.answer(true);
    expect(unsaved.dirty()).toBe(true);
    await opening;
    expect(browser.selected()).toBe('b.ts');
    expect(browser.dirty()).toBe(false);
    expect(unsaved.dirty()).toBe(false);
  });

  it('clicking the selected file retries after an error',async () => {
    const readFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(text('ok', 'v1'));
    const { browser } = setup({ readFile });
    await browser.open('a.ts');
    expect(browser.content()).toEqual({ error: 'boom' });
    await browser.open('a.ts');
    expect(readFile).toHaveBeenCalledTimes(2);
    expect(browser.baseline()).toMatchObject({ path: 'a.ts', text: 'ok' });
  });

  it('clicking the selected file while dirty does nothing', async () => {
    const { api, browser, unsaved } = setup();
    await browser.open('a.ts');
    browser.setDirty(true);
    await browser.open('a.ts');
    expect(api.readFile).toHaveBeenCalledTimes(1);
    expect(unsaved.prompt()).toBeUndefined();
    expect(browser.dirty()).toBe(true);
  });

  it('reveal calls revealFile', async () => {
    const { api, browser } = setup();
    await browser.open('a.ts');
    await browser.reveal();
    expect(api.revealFile).toHaveBeenCalledWith('p', 'a.ts');
  });
});
