# Renderer (apps/renderer)

Angular 21 renderer for the Ascua window. Runs sandboxed with context
isolation, loaded from `file://` in the packaged app. Read the root
`CLAUDE.md` first for commands and global constraints.

## Rules that are easy to break

- **Zoneless.** State read by templates must be signals. IPC callbacks need no
  `NgZone.run`.
- **Strict templates.** `strictTemplates` and `noPropertyAccessFromIndexSignature`
  are on. Use bracket access for index signatures (`dataset['x']`).
- **No hardcoded UI text.** Use `| transloco` in templates; TS returns `Text`
  (`text(key, params)`) and the template renders it. Run `npm run i18n:check`.
- **Feature routes** declare `provideTranslocoScope('<scope>')` and
  `resolve: { ... scopeResolver('<scope>') }`, or the page shows empty strings.
- **Hash routing only.** `withHashLocation()` is required for `file://`.
- **Body classes are written synchronously** by `RoomState`. Do not bind them.
- **Keep `html`/`body` transparent.** Window is frameless.
- **Styles are global.** Components have no `styleUrl`. All CSS lives in
  `src/styles/*.css`, imported in cascade order from `src/styles.css`.
  Thin scrollbars: add new scroll areas to the selector list in
  `workbench.css`.
- **Tests run in jsdom.** Guard `matchMedia` and `SVGElement.pauseAnimations`.
- **Browser preview is not the app.** `serve renderer` has no `window.ascua`.

## Where things live

- `src/app/app.ts` - composes `layout/`, binds Escape and resize. Nothing else.
- `src/app/app.routes.ts` - lazy feature routes via `loadChildren`.
- `src/app/app.config.ts` - `paramsInheritanceStrategy: 'always'`, so
  `projectId` binds as an input in nested pages.
- `src/app/layout/` - always-present chrome: `avatar`, `permission-bubble`,
  `room` (ring, embers, `<router-outlet>`), `room-bar` under `room/` (breadcrumb from
  `crumbs.ts`), `rail`, `project-side`.
- `src/app/core/` - root services with signals:
  - `room/room-state.ts` - bloom, collapse, corner layout, body classes.
  - `permissions/` - queue and Claude Code alert/warn/ask rules.
  - `companion/` - the avatar's life loop.
  - `bridge/ascua-api.ts` - `ASCUA_API`, the injectable `window.ascua`.
  - `projects/` (`ProjectStore`), `terminals/` (`TerminalSessions`: statuses,
    output fan-out, `attach` replays and dedupes by `seq`).
  - `source-control/` (`SourceControlStore`): connection status and
    pass-through queries; no fetched data kept.
  - `unsaved/` (`UnsavedChanges`) - `canDeactivate` guard for the editor.
  - `i18n/loader.ts` - the scope loader map (new catalogs register here).
- `src/app/features/<name>/` - screens inside the room. Each has
  `<name>.routes.ts`. Nested lazily:
  - `projects/` - form and project page with tabs; hosts `terminals/` (xterm)
    and `files/` as lazy child routes, keeping xterm and CodeMirror out of the
    projects chunk.
  - `terminals/terminal-view.ts` stops Escape at its host and resizes the PTY
    only while the room is open.
  - `files/` - `FileBrowser` (lazy tree, filter index, CodeMirror 6 editor,
    Ctrl+S, conflict banner). `code-editor.ts` stops Escape at its host.
  - `repositories/` - device-code connect, then repos, PRs/commits, PR diff.
- `src/app/shared/` - reusable components. See `shared/CLAUDE.md`.
- `src/styles/` - `tokens.css` (design tokens, never on `html`/`body`),
  `controls.css` (`as-*` controls), `workbench.css` (layout), `projects.css`,
  and the other per-feature sheets.
- `src/i18n/` - root catalogs `{es,en}.json` and per-scope folders.

## Assistant and voice

Main side (engine, tools, confirmations, SAB switch): `apps/desktop/CLAUDE.md`.
Code lives in `features/assistant`, `core/assistant`, `core/navigation`
(main-initiated routing), `core/voice` (ports, `whisper/` and `supertonic/`
workers, `runtime/` model cache) and `core/i18n/labels.ts`. Not related to the
`chats` module.

- **UI knowledge.** `core/i18n/labels.ts` resolves `UI_LABEL_KEYS`; they and
  the route go to main.
- **Status text** next to the avatar (`layout/voice-status`) is non-interactive.
- **Push-to-talk.** Avatar long press (450 ms, no movement), Ctrl+Space held in
  the room (capture phase, so xterm/CodeMirror never see it), or the composer
  mic.
- **STT** is Whisper (transformers.js) in a Web Worker. `whisperProfile(device)`
  in `voice-models.ts`: with WebGPU and `shader-f16`, `whisper-large-v3-turbo`
  q4f16 (~566 MB); otherwise `whisper-small` q8 (~252 MB). `detectDevice()`
  falls back to wasm (Xvfb, Linux without WebGPU). The vocabulary prompt
  (project, pista and UI names) goes through `decoder_input_ids`
  (`whisper-prompt.ts`) because transformers.js 3.8.1 ignores `prompt_ids`.
- **TTS** is Supertonic 3 (ONNX in a worker, es+en, fp32 ~398 MB, ~0.8 GB RSS
  loaded, unloaded after 5 min idle) and the only TTS: no OS voices on
  purpose. Kokoro was dropped (English-only; full espeak-ng is GPL-3.0). The
  Supertonic revision is pinned in `voice-models.ts`; attribution in
  `THIRD_PARTY_NOTICES.md`.
- **Model cache.** Cache Storage fails on `file://`, so models live in
  IndexedDB (`ascua-voice-models`, `runtime/model-cache.ts`). One
  `onnxruntime-web`, pinned to the exact version transformers depends on (bump
  together), wasm served from the `voice-runtime/` asset. `wasmThreads()` sets
  ORT `numThreads` to cores - 1 (1 without SAB, as in the browser preview).
- **CSP.** `src/index.html` has a `<meta http-equiv>` policy and the
  SharedArrayBuffer switch relies on it (no injected script may run).
  `script-src 'self' 'wasm-unsafe-eval'` (no inline/eval), `worker-src 'self'
blob:` (module workers, ORT pthreads, ui-drive blob worker), `connect-src`
  `'self'` + Hugging Face (`huggingface.co`, `*.huggingface.co`, `*.hf.co`) +
  `localhost:4200` http/ws, `img-src 'self' data: blob:`, `media-src blob:`
  (TTS audio), `style-src 'self' 'unsafe-inline'` (xterm, CodeMirror, Angular
  inject styles; styles only), everything else `'none'`. GitHub is fetched from
  main, so no GitHub origin. `optimization.styles.inlineCritical` is off in
  `apps/renderer/project.json` (its `onload` handler is blocked). To add an
  origin, extend the matching directive and run `node tools/ui-drive.cjs
dist/ui-drive` watching the console for "Refused to".
- **Worker builds** print the harmless warning "webWorkerTsConfig not yet
  supported"; the chunks are emitted.

## Dimensions shared with main

`COMPACT` (420x320) and `AVATAR` (120) must match
`apps/desktop/src/app/window/geometry.ts`. Bubble offset lives in
`styles/bubble.css`. Change both sides together.

## Tests

`npx nx test renderer --run`. Component specs import `i18nTesting('es')` from
`src/app/testing/i18n.ts` and assert real Spanish text. `core/i18n/catalog.spec.ts`
checks key parity between es and en.
