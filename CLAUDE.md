# CLAUDE.md

Ascua is an Electron desktop companion with an Angular 21 renderer in one
transparent, frameless `BrowserWindow`. Keep the single-window model and the
Node hook. Per-area guides: `apps/renderer/CLAUDE.md`, `apps/desktop/CLAUDE.md`,
`apps/renderer/src/app/shared/CLAUDE.md` (components library).

## Commands

- `npm start` - `nx serve desktop` (renderer dev server on 4200 + Electron).
- `npx nx build desktop` - renderer build, then Electron main.
- `npx nx package desktop` - `dist/packages/win-unpacked/ascua.exe`.
- `npx nx make desktop` - installers under `dist/executables`.
- `npx nx lint renderer` / `npx nx lint desktop`.
- `npm run format` (write) and `npm run format:check` (gate).
- `npm run i18n:check` - fails on hardcoded UI text.
- Tests: `npx nx test renderer --run` (jsdom), `npx nx test desktop --run`
  (vitest, node). One renderer file: `--testFile=<path>`.
- `npx nx serve renderer` is browser-only: `window.ascua` is absent. Use
  `serve desktop` to test the real app.
- `node tools/ui-drive.cjs <outDir>` after `npx nx build desktop` (Playwright
  scenarios in `tools/ui-drive/`). Close any running Ascua first: the hook pipe
  is shared.
- `npx nx build indexer` / `npx nx test indexer --run` / `npx nx lint indexer`; `nx serve desktop` also
  runs `indexer:serve`. Output: `dist/apps/indexer/main.mjs` (ESM, bundled) plus the
  tree-sitter `.wasm` files and `.scm` queries copied by
  `tools/indexer-assets.mjs`.
- `npx electron tools/pty-smoke.cjs <pty-host.js>` checks the pty host.
- ui-drive subsets: `--grep assistant`, `--grep voice` (or a spec file name).
- Test seams for assistant/voice: `ASCUA_VOICE_FAKE=<phrase|phrase>` (scripted
  recognizer and fake synthesizer recording `window.__ascuaSpoken`),
  `--use-fake-device-for-media-stream` (via `Seed.args`), `Seed.env`,
  `Seed.voice` (seeded `autoSpeak: false` so no scenario downloads models).
- Dev-only logs: `[ascua:timing]` (renderer, per voice turn), `[ascua:voice]`
  (engine, device, threads), `[assistant:timing]` (main: warm, spawn, first
  delta, done).

Full verify chain:

```sh
npm run format:check && npm run i18n:check && npx nx lint renderer && npx nx lint desktop && npx nx lint indexer && npx nx test renderer --run && npx nx test desktop --run && npx nx test indexer --run && npx nx build desktop && npx nx build indexer
```

Run `npx nx package desktop` when changing packaging, preload, or the hook.
Run `npm run linux:check` when touching main, preload, packaging, terminals or
the hook.

## Layout

- `apps/desktop` - Electron main, preload, pty host, window, IPC services.
  See `apps/desktop/CLAUDE.md`.
- `apps/renderer` - Angular renderer (zoneless, signals, sandboxed). See
  `apps/renderer/CLAUDE.md`.
- `apps/indexer` - agent-facing code indexer (Effect 4, web-tree-sitter WASM, ts
  only). Standalone Node app: not part of the Electron package, its deps are
  devDependencies, and it must not import renderer or main code. `index` and
  `mcp` both take `--db <file>` (default `<root>/.ascua/index.db`, standalone
  use); the desktop app passes `userData/indexes/<projectId>.db` and never
  writes into the user's project.
- `libs/ascua-ipc` (`@ascua/ipc`) - IPC channel names and shared types.
  Dependency-free; imported by main, preload and renderer.
- `libs/character` (`@ascua/character`) - framework-agnostic SVG character and
  life loop. Art is all-rights-reserved; see the root `NOTICE`.
- `libs/source-control` (`@ascua/source-control`) - provider-agnostic model,
  ports and `SourceControlError`. Dependency-free.
- `libs/assistant` (`@ascua/assistant`) - tool and registry ports,
  `AssistantEngine`, `AssistantError`, `reduceTranscript`. Dependency-free.
  Main side: `apps/desktop/src/app/assistant/`; renderer: `features/assistant`,
  `core/assistant`, `core/navigation`, `core/voice`. Details in the desktop and
  renderer guides. `THIRD_PARTY_NOTICES.md` credits ported code.
- Shared libs have no build target; they resolve through `tsconfig.base.json`.
- `tools/` - ui-drive, linux check, hook (`ascua-hook.mjs`), i18n check.

## Constraints that bite

- One window. The room is a fullscreen state of it, not a second window.
- The renderer is sandboxed with context isolation. Add IPC by extending
  `AscuaApi`/`IPC` in `@ascua/ipc` and the preload. Never expose `ipcRenderer`.
- GitHub token never leaves main (safeStorage). Fetched data is memory-only.
- Dragging is custom (`dragStart()` + `setBounds()`). No
  `-webkit-app-region: drag`.
- Keep `html`/`body` transparent. A body background breaks the companion effect.
- `COMPACT` (420x320) and `AVATAR` (120) are duplicated in
  `window/geometry.ts` and the renderer CSS. Change both together.
- `RoomState` writes body classes and `--ox/--oy/--os` synchronously, not
  through bindings. Do not move them into change detection.
- Routing is hash-based (`withHashLocation()`); `index.html` has no `<base>`.
- Every change must work on Windows and Linux. Linux forces X11.
- Hook endpoint must fail open.
- Only one Ascua instance may run (dev and packaged share the pipe).

## i18n

No hardcoded UI text. Templates use `| transloco`. TS models return `Text`,
not strings. Main returns `AscuaError` codes; the renderer maps them to
`errors.<code>`. Catalogs live in `apps/renderer/src/i18n/` (es and en must
have the same keys). Use `// i18n-ignore` only for legitimate non-UI literals.

## Ascua mcp harness

- If available prefer using rather than Glob, Grep, ascua mcp for searching through the codebase as the mcp indexes files for fast search
