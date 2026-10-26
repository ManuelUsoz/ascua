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
- `npm run format` writes Prettier formatting; `npm run format:check` is the
  gate.
- `npx nx test renderer --run`; one file:
  `npx nx test renderer --run --testFile=src/app/app.spec.ts`.
  Desktop: `npx nx test desktop --run` (vitest, node env; specs import from
  `vitest` explicitly).
- `npx electron tools/pty-smoke.cjs <path to pty-host.js>` proves the pty host
  works (run it on `dist/apps/desktop/pty-host.js` and on the packaged
  `dist/packages/win-unpacked/resources/app.asar/desktop/pty-host.js`).
- `npx nx serve renderer` is a browser preview only: `window.ascua` is absent,
  so drag, fullscreen, and permissions are unavailable. Use `serve desktop` to
  test the real app.
- The Vite `__dirname` config warning during renderer test/build is harmless.
- `node tools/ui-drive.cjs <outDir> [playwright args]` (after `npx nx build
desktop`) is a wrapper over the Playwright Test scenarios in
  `tools/ui-drive/*.spec.ts` (one Electron launch per spec file, temp user-data
  dir and fixture project): room, projects, pistas, terminals (shells, Levantar
  todo, viewports), files, editor (dirty, Ctrl+S, conflicts, unsaved guard) and
  archivos viewports, and settings (language switch that survives a
  relaunch), with screenshots in `<outDir>`. The driver runs in Spanish
  whatever the OS language (it seeds `settings.json`); `--grep settings` runs
  the language scenario, `--grep editor` (or a spec file name) another area.
  `--grep repositories` runs the offline GitHub scenario (`net.fetch` and
  `shell.openExternal` stubbed in main). Close any running Ascua first: the
  hook pipe is shared.
- `npm run linux:check` proves the Linux build in Docker (needs Docker Desktop
  with Linux containers; the first run is slow). It writes
  `ascua-<version>.AppImage`, `ui-drive/` and `ui-drive-appimage/` to
  `dist/linux/`. On Linux, `nx make desktop` produces the AppImage under
  `dist/executables/`; `nx package desktop` stays dir-only (`linux-unpacked`).

## Where things live

- `apps/desktop/src/app/window/` - the only `BrowserWindow`. `ascua-window.ts`
  creates it and wires events to the modules; `fullscreen.ts` (controller,
  owns `expanded`) with `fullscreen-mode.ts` (native vs Linux pseudo),
  `geometry.ts` (pure math, `COMPACT`/`AVATAR`), `click-through.ts`, `drag.ts`,
  `position-store.ts`, `renderer-page.ts` (load + hardening), `window-ipc.ts`.
- `tools/linux/` - `Dockerfile` (node:24-bookworm + Xvfb + openbox + Electron
  libs) and `check.sh` (lint, tests, build, pty-smoke, ui-drive, `nx make`,
  AppImage extract, pty-smoke + ui-drive on the AppImage).
  `tools/linux-check.mjs` does the docker build/run from Windows, mounting
  `dist/linux` at `/out`.
- `apps/desktop/src/app/permissions/` - `hook-server.ts` (permission
  pipe/socket server) and `permission-bridge.ts` (queue, bubble flag, resend on
  load); `tools/ascua-hook.mjs` - the Claude Code hook (one-line JSON, fails
  open).
- `apps/desktop/src/app/settings/` - `json-settings-repository.ts`
  (`userData/settings.json`), `settings-ipc.ts`, `initial-language.ts`.
- `apps/desktop/src/app/storage/atomic-json.ts` - `writeJsonAtomic`, shared by
  the project and settings repositories.
- `apps/desktop/src/app/i18n/main-messages.ts` - native-dialog text (es/en).
- `apps/desktop/src/app/api/main.preload.ts` - the `window.ascua` bridge.
- `apps/desktop/src/app/projects/` - `ProjectRepository` is the storage swap
  point (SQLite later); `JsonProjectRepository` writes atomically to
  `userData/projects.json`. `project-input.ts` validates input;
  `project-ipc.ts` registers the IPC and calls a `ProjectListener`.
- `apps/desktop/src/app/source-control/` - `github/` (device flow + REST
  provider), `SafeStorageCredentialStore`, `TtlCache`, `SourceControlService`
  (status, connect, cached queries) and `source-control-ipc.ts`.
- `apps/desktop/src/app/files/` - `ProjectFiles` (list, filter index, versioned
  read, contained in-place write that refuses with a conflict when the content
  hash changed) and `files-ipc.ts`. `launch-policy.ts` decides `openable`:
  `openFile` (`shell.openPath`) refuses executables/scripts and binaries; the
  UI offers `revealFile` instead. Every path goes through `resolveInside`: it rejects absolute and `..` paths
  and re-checks after `realpath`, so symlinks/junctions cannot escape the
  project root. The index skips `.git`, `node_modules`, `dist` and caps at
  20000 files (`truncated`).
- `apps/desktop/src/app/terminals/` - `TerminalManager` (sessions, exit
  mapping) has two kinds of terminal: pistas (saved in the project, one folder
  each picked with `pickTerminalFolder`, must stay inside the project) and
  ad-hoc shells ("+ Terminal": `openShell`, not saved, closable with
  `closeShell`, named shell / shell 2...; `terminalRemoved` tells the renderer
  to drop them). It talks to a `PtyBackend`; `PtyHostClient` forks the pty host, a
  `utilityProcess` (`host/pty-host.ts`) owning node-pty, the output ring buffer
  (replay) and process-tree kill. The host is an extra webpack entry
  (`additionalEntryPoints` in `apps/desktop/project.json`), packaged through
  `maker.options.json` `files` + `asarUnpack` for node-pty (`npmRebuild:
false`, node-pty ships prebuilds). `shell.ts` resolves Git Bash on Windows
  (PowerShell fallback, `$SHELL` on Unix) and sets `CHERE_INVOKING=1` so the
  login shell keeps the terminal cwd instead of `$HOME`. `quit-guard.ts` asks
  for confirmation on quit while terminals run.
- `apps/renderer/src/app` - the Angular renderer. `app.ts` only composes
  `layout/` and binds Escape/resize.
  - `core/` - root services with signals: `room/room-state.ts` (bloom,
    collapse, corner layout), `permissions/` (queue and the Claude Code
    alert/warn/ask rules), `companion/` (the avatar's life loop),
    `bridge/ascua-api.ts` (`ASCUA_API`, the injectable `window.ascua`).
  - `layout/` - always-present chrome: `avatar`, `permission-bubble`, `room`
    (ring, embers and the `<router-outlet>`); `room/` also holds `room-bar`
    (breadcrumb from `crumbs.ts`, window buttons), `rail` and `project-side`.
  - `core/projects` (`ProjectStore`) and `core/terminals` (`TerminalSessions`:
    statuses plus output fan-out; `attach` replays and dedupes by `seq`).
  - `features/<name>/` - screens shown inside the room. Each default-exports
    `<name>.routes.ts` and is registered with `loadChildren` in
    `app.routes.ts`. `projects` (form, project page with tabs) nests
    `terminals` (xterm grid) as a lazy child route, which keeps xterm out of
    the projects chunk. `app.config.ts` uses `paramsInheritanceStrategy:
'always'` so `projectId` binds as an input in nested pages.
  - `features/files/` - the Archivos tab (`FileBrowser`: lazy tree, filter
    index loaded on first focus, CodeMirror 6 editor with Ctrl+S save and
    conflict banner). Lazy child route of the project page, like `terminals`.
    CodeMirror lives only in this chunk; `code-editor.ts` stops Escape at its
    host. `UnsavedChanges` (core/unsaved) guards `canDeactivate`, switching
    files and the room Close button; only Close asks, collapse/minimize/Escape
    do not (the editor stays alive).
  - `features/terminals/terminal-view.ts` stops Escape at the host so it
    reaches the TUI instead of collapsing the room, and only resizes the PTY
    while the room is open (a compact window must not shrink it).
  - `core/source-control` (`SourceControlStore`): connection status and
    pass-through queries; fetched data is not kept in the store.
  - `features/repositories/` - the Repositorios screen (scope `repositories`):
    connect with a device code, then repos -> PRs/commits -> PR diff.
  - `shared/character/` - the `[appCharacter]` directive that mounts
    `@ascua/character` into its host element.
- `apps/renderer/src/styles.css` - imports `styles/*.css` (base, tokens,
  avatar, bubble, room, controls, workbench, projects, terminals, files, settings, bloom,
  motion) in cascade order.
  `tokens.css` holds the design tokens (never on `html`/`body`; `#room` sets
  `color-scheme: dark`); `controls.css` the `as-*` controls (button, chip, state,
  form fields), `workbench.css` the layout (bar, rail, tree, tabs, page head)
  and `projects.css` the project screens. All renderer styling stays
  global there; components have no `styleUrl`. Thin scrollbars live in one
  selector list in `workbench.css`: add new scroll areas there. The terminals grid
  goes to one column under an 860px container width, so 1280x720 keeps two
  columns.
- `libs/character` (Nx project `ascua-character`, import `@ascua/character`) -
  framework-agnostic SVG character and life loop. Art is all-rights-reserved;
  see `NOTICE`.
- `libs/ascua-ipc` (Nx project `ascua-ipc`, import `@ascua/ipc`) - IPC channel
  names and shared types. Keep it dependency-free; it is imported by main,
  preload, and renderer.
- `libs/source-control` (Nx project `source-control`, import
  `@ascua/source-control`) - provider-agnostic model, ports
  (`SourceControlProvider`, `DeviceAuthorizer`) and `SourceControlError`.
  Dependency-free; `@ascua/ipc` only `import type`s from it.
- `libs/notes` (Nx project `ascua-notes`, import `@ascua/notes`) - heading
  slugs, `[[wiki link]]` parsing, note-name validation and `renameNoteLinks`
  (rewrites `[[Old]]` links, skipping code). Dependency-free.
- `apps/desktop/src/app/notes/` - `NoteStore` over `userData/notes/*.md` and
  its IPC; `rename` moves the file (case-only renames via a temp name) and
  rewrites links in all notes, best effort (`renameNote` in the bridge);
  `apps/renderer/src/app/features/notes/` - "Mis notas" pages
  (CodeMirror edit, marked + DOMPurify view).
- `tools/ascua-notes-mcp.mjs` - read-only MCP server so Claude Code can read
  the notes. Its slug logic is a copy of `@ascua/notes`: keep them in sync.
- Shared libs are source-only (no build target); they resolve through
  `tsconfig.base.json` paths and are wired with `implicitDependencies`.

## Non-obvious constraints

- The GitHub token never leaves main. It is stored through safeStorage in
  `userData/source-control.json`, even on Linux `basic_text` (obfuscation
  only, readable by processes of the same user). Scopes are `repo read:user`.
  `net.fetch` is read at call time (ui-drive stubs it). "Enable Device Flow"
  must be ticked on the OAuth App, otherwise `sourceControl.unavailable`.
  Disconnect only deletes the token locally (revoke at
  github.com/settings/applications). Fetched data is cached in memory only
  (60 s TTL), never on disk.

- `maker.options.json` keeps `npmRebuild: false` on purpose: node-pty 1.1.0
  ships N-API prebuilds (`prebuilds/win32-x64`), ABI-stable across Electron
  versions, but electron-builder's rebuild ignores them and compiles from
  source, which fails without the VS Build Tools Spectre libs (MSB8040). For the
  same reason `tools/postinstall.mjs` skips `electron-builder install-app-deps`
  on Windows, so `npm install` exits 0 there.
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
  display. `expanded` in `window/fullscreen.ts` is the source of truth. Fullscreen is
  announced only after the bounds match the display; the bloom origin is DIP
  relative to the display's top-left. Preserve this when touching fullscreen.
- `COMPACT` (420x320) and `AVATAR` (120) are duplicated between
  `window/geometry.ts` and the renderer CSS (`styles/avatar.css`, bubble offset in `styles/bubble.css`).
  Change both together.
- The avatar can sit in any corner; main sends `Layout` and the renderer applies
  `body[data-x]`/`body[data-y]`. Keep bloom-origin and hit-test math in sync.
- `RoomState` writes the `body` classes (`is-open`, `is-closing`, `is-waking`,
  `is-settled`, `has-origin`) and `--ox/--oy/--os` synchronously, not through
  bindings or effects: the bloom is timed against native resizes and animation
  frames, and one change-detection tick late shows as a blink.
- The renderer is zoneless: state read by templates must be signals, and IPC
  callbacks need no `NgZone.run`.
- Routing uses `withHashLocation()` because the packaged renderer is loaded
  from `file://`. `index.html` has no `<base href>` on purpose: with it a
  reload on `file://` resolved assets against the hash route and broke.
- A full renderer load (Ctrl+R, dev-server reload) while the room is open
  makes main call `exitFullscreen()` (`did-navigate` in `window/ascua-window.ts`; hash
  routing only fires `did-navigate-in-page`), so the fresh renderer and the
  window agree on compact. Keep `expanded` as the source of truth.
- `ASCUA_RENDERER=dist` makes main `loadFile` the built renderer even when not
  packaged (used by `tools/ui-drive.cjs`).
- Keep `html`/`body` transparent. The window is frameless/transparent; a body
  background breaks the desktop companion effect.
- Position is stored in `%APPDATA%\ascua\position.json` packaged and
  `%APPDATA%\Electron\position.json` in dev. On Linux it is
  `~/.config/ascua/position.json` (dev: `~/.config/Electron`).
- Repo convention: every change must work on Windows and Linux.
- Linux forces X11/XWayland (`ozone-platform=x11` in `main.ts` and the AppImage
  `executableArgs`): native Wayland blocks `getCursorScreenPoint` (click-through
  polling, drag), `setBounds` and always-on-top.
- On Linux the room does not use native fullscreen: `toggleFullscreen` sets
  resizable + always-on-top('screen-saver') + `setBounds(display.bounds)`,
  `restoreCompactBounds` sets resizable false again, and `IPC.isFullscreen`
  returns `expanded`. Reason: under the openbox/Xvfb WM fullscreen failed ~1 in
  6 and Electron ignores `setBounds` while it thinks it is fullscreen. Bounds
  can be 1 px short (1919x1079); checks allow 2 px. Real GNOME/KDE,
  transparency and Wayland need a manual check.
- On Linux/macOS, node-pty is compiled by `tools/postinstall.mjs`
  (`electron-builder install-app-deps`; no linux prebuilds), so
  `npmRebuild: false` is fine there. The Dockerfile copies the script before
  `npm ci`.
- In Docker, Electron needs `ELECTRON_DISABLE_SANDBOX=1` (ui-drive then adds
  `--no-sandbox`), Xvfb plus a WM, and `--shm-size`. dbus errors in the log are
  harmless.
- The AppImage was only verified with `--no-sandbox` in Docker; run it once
  without it on a real distro. Distros that restrict unprivileged user
  namespaces for AppImages (Ubuntu 24.04+ AppArmor,
  `kernel.apparmor_restrict_unprivileged_userns`) make Chromium's sandbox fail
  to start. Workarounds: run with `--no-sandbox` (less secure) or install an
  AppArmor profile for the AppImage path. Do not add `--no-sandbox` to
  `executableArgs`.
- `ASCUA_EXECUTABLE=<packaged binary>` drives ui-drive against a packaged app
  (`win-unpacked/ascua.exe` or the extracted AppImage's `ascua`).
- The renderer dev port 4200 is hard-coded in `constants.ts`.
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

## i18n

No hardcoded UI text. Spanish (`es`) and English (`en`) through Transloco.

- Catalogs: `apps/renderer/src/i18n/{es,en}.json` (root scope) and
  `apps/renderer/src/i18n/<scope>/{es,en}.json` (one lazy scope per feature).
  A new catalog must be added to the loader map in
  `core/i18n/loader.ts`; `testing/i18n.ts` (`i18nTesting(lang = 'es')`) builds
  from the same map, and component specs import it and assert real es.json
  text. `core/i18n/catalog.spec.ts` checks es/en key parity.
- Templates use the pipe: `{{ 'nav.projects' | transloco }}`,
  `[attr.aria-label]="'room.close' | transloco"`. Never a literal.
- TS models return `Text` (`text(key, params)`, `pluralKey`), never a string;
  the template renders it. `translateSignal` only where an API needs a string.
- Feature routes declare `provideTranslocoScope('<scope>')` and a `resolve`
  with `scopeResolver('<scope>')`, or the page renders empty strings for a frame.
- Main never sends user-facing prose: it returns `AscuaError` codes (see
  `@ascua/ipc`, `*_ERROR_CODES`, `encodeError`/`decodeError`) and the renderer
  shows `errors.<code>` (`toAscuaError`, `errorText`). Add a code to the array
  and `errors.<code>` to both root catalogs.
- Native dialogs (quit confirmation) use `apps/desktop/src/app/i18n/main-messages.ts`
  (`MainText`, typed es/en dictionary).
- The language lives in main, `userData/settings.json`
  (`getSettings`/`updateSettings`/`onSettingsChanged`); first launch follows the
  OS language if es or en, else Spanish. Switch it in Ajustes.
- Guard: `npm run i18n:check` (`tools/i18n-check.mjs`) fails with `file:line`
  on literal template text/attributes and prose literals in `throw`, `error:`,
  `message:`, `buttons:`, `title:`, `label:`, `.set(` and `return`. It is regex
  based; for a legit non-UI literal add `// i18n-ignore` on the line (or
  `<!-- i18n-ignore -->` on the line before in a template). `events/` and
  `main-messages.ts` are skipped.

## Verify

```sh
npm run format:check && npm run i18n:check && npx nx lint renderer && npx nx lint desktop && npx nx test renderer --run && npx nx test desktop --run && npx nx test ascua-notes --run && node --test tools/ascua-notes-mcp.test.mjs && npx nx build desktop
node tools/ui-drive.cjs dist/ui-drive
```

Run `npx nx package desktop` when changing packaging, preload, or the hook.
Run `npm run linux:check` when touching main, preload, packaging, terminals or
the hook.
