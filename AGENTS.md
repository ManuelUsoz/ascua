# AGENTS.md

Ascua is an Electron desktop companion with an Angular 21 renderer in one
transparent, frameless `BrowserWindow`. This workspace is the Electron/Nx port
of the old Tauri prototype; keep the single-window model and the Node hook.

## Commands

- `npm start` = `npx nx serve desktop`. Starts the renderer dev server on 4200
  and Electron. `desktop:serve` already waits for `renderer:serve`.
- `npx nx build desktop` builds the renderer, then the Electron main process.
- `npx nx package desktop` -> `dist/packages/win-unpacked/ascua.exe`.
  `npx nx make desktop` -> installers under `dist/executables`.
- `npx nx lint desktop` / `npx nx lint renderer`.
- `npx nx test renderer --run`; one file:
  `npx nx test renderer --run --testFile=src/app/app.spec.ts`.
  Desktop has no unit-test target.
- `npx nx serve renderer` is a browser preview only: `window.ascua` is absent,
  so drag, fullscreen, and permissions are unavailable. Use `serve desktop` to
  test the real app.
- The Vite `__dirname` config warning during renderer test/build is harmless.
- `renderer-e2e` is an unmaintained scaffold (its example still expects
  "Welcome") and is not part of the verification flow.

## Where things live

- `apps/desktop/src/app/window.ts` - the only `BrowserWindow`: compact bounds,
  fullscreen, drag, click-through polling, position persistence, permission
  wiring.
- `apps/desktop/src/app/hook-server.ts` - permission pipe/socket server;
  `tools/ascua-hook.mjs` - the Claude Code hook (one-line JSON, fails open).
- `apps/desktop/src/app/api/main.preload.ts` - the `window.ascua` bridge.
- `apps/renderer/src/app/app.ts` - room/character orchestration and permission
  queue; `app.html` - markup.
- `apps/renderer/src/styles.css` - all renderer styling (avatar, bubble, room,
  Inter). `apps/renderer/src/app/app.css` is intentionally just a comment.
- `libs/character` (Nx project `ascua-character`, import `@ascua/character`) -
  framework-agnostic SVG character and life loop. Art is all-rights-reserved;
  see `NOTICE`.
- `libs/ascua-ipc` (Nx project `ascua-ipc`, import `@ascua/ipc`) - IPC channel
  names and shared types. Keep it dependency-free; it is imported by main,
  preload, and renderer.
- Shared libs are source-only (no build target); they resolve through
  `tsconfig.base.json` paths and are wired with `implicitDependencies`.

## Non-obvious constraints

- Keep one window. The room is a fullscreen state of the same window, not a
  second window.
- The renderer is sandboxed with context isolation. Add IPC by extending
  `AscuaApi`/`IPC` in `@ascua/ipc` and the preload; never expose `ipcRenderer`.
- In compact mode the window is click-through except the avatar. If you add
  compact UI, make main mark the window interactive (as the permission bubble
  does) or clicks will pass through it.
- Dragging is custom: the renderer detects a 4 px pointer move and calls
  `dragStart()`; main samples the cursor and calls `setBounds()`. Do not use
  `-webkit-app-region: drag`.
- On Windows, `isFullScreen()` can be false while the bounds already cover the
  display. `expanded` in `window.ts` is the source of truth. Fullscreen is
  announced only after the bounds match the display; the bloom origin is DIP
  relative to the display's top-left. Preserve this when touching fullscreen.
- `COMPACT` (420x320) and `AVATAR` (120) are duplicated between `window.ts` and
  the renderer CSS (`#ascua-host`, bubble offset). Change both together.
- The avatar can sit in any corner; main sends `Layout` and the renderer applies
  `body[data-x]`/`body[data-y]`. Keep bloom-origin and hit-test math in sync.
- Keep `html`/`body` transparent. The window is frameless/transparent; a body
  background breaks the desktop companion effect.
- Position is stored in `%APPDATA%\ascua\position.json` packaged and
  `%APPDATA%\Electron\position.json` in dev.
- The renderer dev port 4200 is hard-coded in `constants.ts`; update the
  Playwright config too if it changes.
- Permission requests queue. Pending requests are re-sent on `did-finish-load`;
  a hook disconnect emits `permissionDismissed`; a request arriving while the
  room is open collapses it. Only one Ascua instance may run because dev and
  packaged builds share the pipe endpoint.
- Hook endpoint: `\\.\pipe\ascua-<USERNAME>` on Windows, or
  `$XDG_RUNTIME_DIR/ascua.sock` (temp-dir fallback) on Unix. The hook must fail
  open.
- Renderer TS is strict with `strictTemplates` and
  `noPropertyAccessFromIndexSignature`; use bracket access for index
  signatures (`dataset['x']`). Tests run in jsdom: guard browser-only APIs such
  as `matchMedia` and `SVGElement.pauseAnimations`.
- `npx nx lint desktop` has three pre-existing warnings in the nx-electron
  `events/` scaffold; do not treat them as new failures.
- If `nx package desktop` fails because `dist/packages/win-unpacked.tmp` is
  locked, remove it and retry.

## Verify

```sh
npx nx lint renderer && npx nx lint desktop && npx nx test renderer --run && npx nx build desktop
```

Run `npx nx package desktop` when changing packaging, preload, or the hook.
