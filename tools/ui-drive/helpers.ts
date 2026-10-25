// Helpers bound to the app of one spec file: `const d = drive(ascua)`.
import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';
import * as path from 'node:path';
import type { Ascua } from './ascua';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function drive(ascua: Ascua) {
  const queuePick = (dir: string) =>
    ascua.app.evaluate(
      (_, d) =>
        (globalThis as unknown as { __picks: string[] }).__picks.push(d),
      dir,
    );

  const shot = async (name: string) => {
    await sleep(600);
    await ascua.page.screenshot({
      path: path.join(ascua.outDir, `${name}.png`),
    });
  };

  const bounds = () =>
    ascua.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getBounds(),
    );

  const isOpen = () =>
    ascua.page.evaluate(() => document.body.classList.contains('is-open'));

  /** Double-click the avatar and wait for the bloom to settle (no-op when the
   * room already launched open). */
  const open = async () => {
    if (await isOpen()) {
      await sleep(400);
      return;
    }
    await ascua.page.dblclick('#ascua-host');
    await ascua.page.waitForFunction(() =>
      document.body.classList.contains('is-open'),
    );
    await sleep(1200);
  };

  /** Click a visible button/link by its text or aria-label (also when clipped). */
  const clickText = async (text: string, scope = 'body') => {
    const ok = await ascua.page.evaluate(
      ({ text, scope }) => {
        const root = document.querySelector(scope);
        const el = [
          ...(root?.querySelectorAll<HTMLElement>('button, a') ?? []),
        ].find(
          (e) =>
            e.checkVisibility() &&
            (e.textContent?.trim() === text ||
              e.getAttribute('aria-label') === text),
        );
        if (!el) return false;
        el.click();
        return true;
      },
      { text, scope },
    );
    if (!ok) throw new Error(`No button/link "${text}" in ${scope}`);
  };

  /** Route change through the hash (the renderer uses hash location). */
  const goto = (hash: string) =>
    ascua.page.evaluate((h) => (location.hash = h), hash);

  const pane = (name: string): Locator =>
    ascua.page.locator('.as-term', {
      has: ascua.page.locator('b', { hasText: new RegExp(`^${name}$`) }),
    });
  const paneText = (name: string) =>
    pane(name).locator('.xterm-rows').innerText();
  const waitPaneText = async (name: string, needle: string, ms = 15_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const text = await paneText(name).catch(() => '');
      if (text.includes(needle)) return true;
      await sleep(300);
    }
    return false;
  };
  const waitState = async (name: string, label: string, ms = 15_000) => {
    try {
      await pane(name)
        .locator('.as-state', { hasText: label })
        .waitFor({ timeout: ms });
      return true;
    } catch {
      return false;
    }
  };

  /** Opens the pista form and fills it (does not save). */
  const addPista = async (
    name: string,
    command: string,
    port?: number | null,
    folder?: string,
  ) => {
    await ascua.page.click('.as-page-head__tools >> text=Pista');
    await ascua.page.fill('#pista-name', name);
    await ascua.page.fill('#pista-cmd', command);
    if (port) await ascua.page.fill('#pista-port', String(port));
    if (folder) {
      await queuePick(folder);
      await ascua.page.click('.as-pista-form__folder');
      await sleep(400);
    }
  };

  /**
   * Runs `extra` at each common desktop size with the common layout checks as
   * soft expectations. CDP metrics override: webContents.enableDeviceEmulation
   * changes innerWidth but Playwright screenshots then show the unemulated
   * layout cropped.
   */
  const sweepViewports = async (
    name: string,
    extra: (w: number, h: number, tag: string) => Promise<void>,
  ) => {
    const cdp = await ascua.page.context().newCDPSession(ascua.page);
    for (const [w, h] of [
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
    ]) {
      const tag = `${w}x${h}`;
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(900);
      const c = await ascua.page.evaluate(() => {
        const q = (s: string) => document.querySelector(s);
        const sw = (s: string) => {
          const e = q(s);
          return e ? e.scrollWidth <= e.clientWidth : false;
        };
        const visible = (s: string) => {
          const r = q(s)?.getBoundingClientRect();
          return !!r && r.top >= 0 && r.bottom <= innerHeight && r.height > 0;
        };
        return {
          iw: innerWidth,
          ih: innerHeight,
          noX: sw('#room') && sw('.as-workbench__main') && sw('.as-side'),
          pageScroll: document.documentElement.scrollHeight > innerHeight,
          h1: visible('.as-page-head h1'),
          tabs: visible('.as-tabs'),
          wisp: !!q('.as-rail__ascua svg'),
        };
      });
      expect.soft([c.iw, c.ih], `${tag}: viewport size`).toEqual([w, h]);
      expect
        .soft(
          c.noX,
          `${tag}: no horizontal overflow in #room, .as-workbench__main, .as-side`,
        )
        .toBe(true);
      expect
        .soft(c.pageScroll, `${tag}: page does not scroll vertically`)
        .toBe(false);
      expect
        .soft(c.h1 && c.tabs, `${tag}: head title and tabs are visible`)
        .toBe(true);
      expect.soft(c.wisp, `${tag}: rail shows the wisp`).toBe(true);
      await extra(w, h, tag);
      await shot(`${name}-${tag}`);
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(600);
  };

  return {
    get app() {
      return ascua.app;
    },
    get page() {
      return ascua.page;
    },
    sleep,
    queuePick,
    shot,
    bounds,
    isOpen,
    open,
    clickText,
    goto,
    pane,
    paneText,
    waitPaneText,
    waitState,
    addPista,
    sweepViewports,
  };
}

export type Drive = ReturnType<typeof drive>;
