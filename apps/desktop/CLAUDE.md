# Desktop (apps/desktop)

Electron main process, preload, and the pty host. Owns the single
`BrowserWindow`, all IPC handlers, persistence and the Claude Code permission
hook server. Read the root `CLAUDE.md` first.

## Entry points

- `src/main.ts` - `Main.initialize()`, then `App.main(application)`.
- `src/app/app.ts` - `App.main()` wires the window and modules.
- `src/app/api/main.preload.ts` - the `window.ascua` bridge.
- `src/app/terminals/host/pty-host.ts` - forked as a `utilityProcess`. Built
  to `dist/apps/desktop/pty-host.js` via `additionalEntryPoints` in
  `project.json`. Sibling files: `pty-protocol.ts`, `output-buffer.ts`,
  `kill-tree.ts`.

## Modules (`src/app/`)

- `window/` - the only `BrowserWindow`. `ascua-window.ts` creates it and wires
  events. `fullscreen.ts` (owns `expanded`, the source of truth),
  `fullscreen-mode.ts` (native vs Linux pseudo-fullscreen), `geometry.ts`
  (`COMPACT`/`AVATAR`), `click-through.ts`, `drag.ts`, `position-store.ts`,
  `renderer-page.ts` (load and hardening), `window-ipc.ts`.
- `permissions/` - `hook-server.ts` (`HookServer`, pipe/socket) and
  `permission-bridge.ts` (queue, bubble flag, resend on `did-finish-load`).
- `terminals/` - `TerminalManager` (pistas saved in a project, and ad-hoc
  shells via `openShell`/`closeShell`), `PtyHostClient` (forks the host),
  `shell.ts` (Git Bash on Windows, PowerShell fallback, `$SHELL` on Unix,
  sets `CHERE_INVOKING=1`), `quit-guard.ts`.
- `projects/` - `ProjectRepository` is the storage swap point;
  `JsonProjectRepository` writes atomically. `project-input.ts` validates;
  `project-ipc.ts` registers handlers.
- `files/` - `ProjectFiles` (list, index, versioned read, contained in-place
  write that refuses on hash conflict), `files-ipc.ts`, `launch-policy.ts`
  (`openable`: `openFile` refuses executables, scripts and binaries; use
  `revealFile`). Every path goes through `resolveInside`, which re-checks after
  `realpath`. The index skips `.git`, `node_modules`, `dist`, caps at 20000.
- `source-control/` - `github/` (device flow and REST), `SafeStorageCredentialStore`,
  `TtlCache` (60 s, memory only), `SourceControlService`, `source-control-ipc.ts`.
- `settings/` - `json-settings-repository.ts` (`userData/settings.json`),
  `settings-ipc.ts`, `initial-language.ts`.
- `storage/atomic-json.ts` - `writeJsonAtomic`, shared by projects and settings.
- `i18n/main-messages.ts` - native dialog text (es/en, typed dictionary).
- `assistant/` - the voice assistant's main side (see "Assistant" below).
  Separate from `chats/`, which also drives Claude but is its own module
  (sessions, providers, usage); the two coexist and are not unified.
- `events/` - Electron Forge scaffold. Not the Ascua entry; leave it alone.
- `constants.ts` - includes the renderer dev port 4200.

## Rules that are easy to break

- **Sandbox.** Add IPC by extending `@ascua/ipc` and the preload. Never expose
  `ipcRenderer`.
- **Main sends codes, not prose.** Return `AscuaError` codes via
  `encodeError`; the renderer owns the copy.
- **Compact mode is click-through** except the avatar. New compact UI must
  mark the window interactive, as the permission bubble does.
- **Fullscreen.** `expanded` is the source of truth. On Windows
  `isFullScreen()` can lie. Fullscreen is announced only after bounds match
  the display. Bloom origin is DIP relative to the display's top-left. Ascua
  launches expanded (`startExpanded()`): the renderer reads `getWindowState()`
  and lands on the open frame, no bloom; the avatar is the collapsed state.
- **Full renderer load while the room is open** calls `exitFullscreen()`
  (`did-navigate`, skipping the launch navigation). Keep the fresh renderer
  and window in agreement.
- **Linux.** `ozone-platform=x11` is forced (also in the AppImage
  `executableArgs`). Native fullscreen is not used; `toggleFullscreen` uses
  `setBounds(display.bounds)`. Bounds may be 1 px short; checks allow 2 px.
  Do not add `--no-sandbox` to `executableArgs`.
- **Hook must fail open.** Pipe is `\\.\pipe\ascua-<USERNAME>` on Windows,
  `$XDG_RUNTIME_DIR/ascua.sock` (or temp dir) on Unix.
- **Native modules.** `apps/desktop/src/app/options/maker.options.json` keeps `npmRebuild: false` on
  Windows (node-pty ships prebuilds; electron-builder rebuild fails without
  Spectre libs). `tools/postinstall.mjs` compiles node-pty on Linux and macOS.
- **Token.** GitHub token stays in main, stored through safeStorage.
- **Position file.** `%APPDATA%\ascua\position.json` packaged, and
  `%APPDATA%\Electron\position.json` in dev. Linux: `~/.config/ascua/`.

## Assistant (main side)

Renderer side (voice, STT/TTS, CSP): `apps/renderer/CLAUDE.md`. Not the same
as `chats/`.

- **Engine.** `ClaudeCodeEngine` drives the user's own `claude -p`
  (stream-json, `--restricted`, cwd `userData/assistant`, never `--bare`). The
  persona goes inline with `--append-system-prompt`
  (`--append-system-prompt-file` does not exist in Claude Code 2.1.310).
  `status()` creates the workDir. `ASCUA_CLAUDE_CLI` forces the CLI path (a
  `.js/.mjs/.cjs` runs as Electron-as-node).
- **Tools.** Capabilities in `assistant/capabilities/` over an
  engine-agnostic `ToolRegistry`, exposed by a hand-rolled MCP server on
  `node:http` (`127.0.0.1`, per-launch bearer token, no SDK). Tool choice is
  the model's, via the persona and intent-written descriptions; no regex fast
  path. The window capability reads `expanded` (`isExpanded()`), not
  `isFullScreen()`, and only opens/collapses the room (no OS minimize).
  Built-in Claude Code tools stay off (`--tools ""`, WebSearch included). All
  registry tools are allowed at CLI level (`mcp__ascua__*`); the registry's
  `Confirmer` is the only gate for writes. On Windows the `.cmd` shim is
  spawned with a shell, so stop/cancel kill the process tree.
- **Lifecycle.** `warm()` spawns `claude` ahead of the first turn; triggers
  are the Asistente page and voice `pressStart`, never app launch. An idle warm
  process is reaped after 10 min (session id kept, next spawn resumes). Cancel
  and barge-in send a stream-json `control_request` `interrupt` instead of
  killing: the CLI answers `control_response`, then a `result`
  `error_during_execution`, and stays alive (a drain swallows that result);
  kill is only the fallback (error response or 3 s timeout). Verified on
  Claude Code 2.1.310: an idle warm process makes no API call, and the
  mcp.json `timeout` (from `toolTimeoutMs`) lets a held tool call last 90 s+.
  `ENABLE_CLAUDEAI_MCP_SERVERS=false` is set in the spawn env (turns and auth
  status), or the CLI loads claude.ai connectors despite `--strict-mcp-config`.
- **Confirmations.** `PermissionSource` (`permissions/permission-source.ts`)
  is the seam shared by `HookServer` and `AssistantConfirmer`; the bridge gives
  every source one id counter. Write tools (`terminals_start`, `_start_all`,
  `_stop`, `_open_shell`, `_close_shell`, `_write`) call `summarize`, then the
  confirmer shows the permission bubble (`source: 'assistant'`) and refuses on
  deny, abort, `turnDone`/`error` (`dismissAll`) or after 120 s. Assistant
  requests keep the room open (hook requests still collapse it) and can be
  answered by voice (sí/dale/no on the next push-to-talk, `yes-no.ts`).
  `rendererReady` resets only on a main-frame, non-same-document navigation
  (`window/ascua-window.ts`), so hash navigations and aborted ones do not drop
  bubbles; `did-finish-load` sets it.
- **UI knowledge.** The renderer pushes real labels (`UI_LABEL_KEYS`) and the
  route (`AssistantContext`) to main (`UiContextStore`); `ui_guide` quotes
  them and `window_state` reports the current screen.
- **Voice permissions.** `media-permission.ts` grants only audio from our own
  renderer (plus the `clipboard-sanitized-write` exception for the device-code
  copy). `autoplayPolicy: 'no-user-gesture-required'`. `setVoiceActive` keeps
  the window interactive (like `permissions.active`) only while listening, not
  while transcribing or speaking. `autoSpeak` defaults to false.
- **Wasm threads.** `main.ts` appends `enable-features=SharedArrayBuffer`
  (`chromium-switches.ts`) on every platform, giving the renderer and workers
  SharedArrayBuffer on `file://`. `crossOriginIsolated` stays false on purpose:
  COOP/COEP needs a custom protocol, which changes the origin (fresh
  IndexedDB, a 650-960 MB re-download) and touches `loadFile`,
  `ASCUA_RENDERER=dist`, `isOwnRendererUrl`, `will-navigate` and the reload
  path. That is the fallback if a future Electron drops the feature; the
  ui-drive `wasm threads` test fails first. No Chromium WebGPU switch on
  purpose (`enable-unsafe-webgpu` would bypass the Linux blocklist).

## Commands

- `npx nx serve desktop` - renderer dev server and Electron.
- `npx nx build desktop` / `package desktop` / `make desktop`.
- `npx nx test desktop --run` - vitest, node env. Specs import from `vitest`.
- `npx nx lint desktop` - three pre-existing warnings in `events/` are known.
- `npx electron tools/pty-smoke.cjs <path to pty-host.js>` - run on
  `dist/apps/desktop/pty-host.js` and the packaged copy under
  `dist/packages/win-unpacked/resources/app.asar/desktop/pty-host.js`.
- If `nx package desktop` fails with `win-unpacked.tmp` locked, delete it and retry.
