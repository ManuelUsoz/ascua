import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { demoProject, useAscua } from './ascua';
import { drive } from './helpers';

// Push-to-talk against a fake `claude` CLI, a scripted recognizer and a fake
// synthesizer (no model downloads), with Chromium's fake microphone.
const ascua = useAscua({
  projects: ({ projectDir }) => [demoProject(projectDir)],
  env: {
    ASCUA_CLAUDE_CLI: path.join(__dirname, 'fake-claude.mjs'),
    ASCUA_VOICE_FAKE:
      'ya terminé por hoy|abre los ajustes|abri una terminal|dale',
  },
  args: ['--use-fake-device-for-media-stream'],
  voice: { enabled: true, autoSpeak: true, style: 'F1' },
});
const d = drive(ascua);

test('getUserMedia works and the model cache opens on this origin', async () => {
  const result = await d.page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tracks = stream.getAudioTracks().length;
    stream.getTracks().forEach((t) => t.stop());
    const idb = await new Promise<boolean>((resolve) => {
      const req = indexedDB.open('ascua-voice-models');
      req.onsuccess = () => {
        req.result.close();
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
    return { tracks, idb };
  });
  expect(result.tracks).toBeGreaterThan(0);
  expect(result.idb).toBe(true);
});

test('wasm threads: SharedArrayBuffer and shared wasm memory work on this origin', async () => {
  // The exact gate of onnxruntime's isMultiThreadSupported, in the page and
  // in a blob module worker.
  const result = await d.page.evaluate(async () => {
    const gate = () => {
      if (typeof SharedArrayBuffer !== 'function') return false;
      try {
        new MessageChannel().port1.postMessage(
          new WebAssembly.Memory({ initial: 1, maximum: 2, shared: true })
            .buffer,
        );
        return true;
      } catch {
        return false;
      }
    };
    const url = URL.createObjectURL(
      new Blob([`self.postMessage((${gate.toString()})());`], {
        type: 'text/javascript',
      }),
    );
    const worker = await new Promise<boolean>((resolve) => {
      const w = new Worker(url, { type: 'module' });
      w.onmessage = (e) => resolve(e.data === true);
      w.onerror = () => resolve(false);
    });
    return { page: gate(), worker };
  });
  expect(result).toEqual({ page: true, worker: true });
});

test('hold Ctrl+Space in the room: spoken phrase becomes a turn', async () => {
  await d.open();
  await d.goto('#/asistente');
  await d.page.waitForSelector('.as-composer__input');
  await d.page.keyboard.down('Control');
  await d.page.keyboard.down('Space');
  await d.sleep(600);
  await d.shot('voice-01-listening');
  await d.page.keyboard.up('Space');
  await d.page.keyboard.up('Control');
  await d.page
    .locator('.as-msg[data-role="user"] .as-msg__text', {
      hasText: 'ya terminé por hoy',
    })
    .waitFor();
  await d.page.waitForFunction(
    () =>
      ((window as unknown as { __ascuaSpoken?: string[] }).__ascuaSpoken ?? [])
        .length > 0,
  );
  await d.page.waitForFunction(
    () => !document.body.classList.contains('is-open'),
  );
  await d.sleep(1200);
  expect(await d.isOpen()).toBe(false);
});

test('long press on the avatar in compact: "abre los ajustes"', async () => {
  const box = await d.page.locator('#ascua-host').boundingBox();
  if (!box) throw new Error('no avatar');
  await d.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await d.page.mouse.down();
  // 450 ms to arm the hold, then more than the 300 ms minimum utterance.
  await d.sleep(1000);
  await d.page.mouse.up();
  await d.page.waitForFunction(() =>
    document.body.classList.contains('is-open'),
  );
  await d.page.waitForFunction(() => location.hash === '#/ajustes');
  await d.sleep(1200);
  const select = d.page.locator('#settings-voice-style');
  await select.waitFor();
  await expect(select.locator('option:checked')).toHaveText(/Femenina 1/);
  await d.shot('voice-02-settings');
});

test('a spoken "dale" approves the assistant confirmation', async () => {
  await d.goto('#/asistente');
  await d.page.waitForSelector('.as-composer__input');
  const hold = async () => {
    await d.page.keyboard.down('Control');
    await d.page.keyboard.down('Space');
    await d.sleep(600);
    await d.page.keyboard.up('Space');
    await d.page.keyboard.up('Control');
  };
  await hold();
  await d.page
    .locator('.as-msg[data-role="user"] .as-msg__text', {
      hasText: 'abri una terminal',
    })
    .waitFor();
  await d.page.locator('#bubble[data-source="assistant"]').waitFor();
  await d.shot('voice-03-confirmation');
  await hold();
  await d.page
    .locator('.as-msg[data-role="assistant"] .as-msg__text', {
      hasText: 'Abrí',
    })
    .waitFor();
  await d.page.waitForFunction(
    () => !document.querySelector('#bubble[data-source="assistant"]'),
  );
  await d.shot('voice-04-approved');
});
