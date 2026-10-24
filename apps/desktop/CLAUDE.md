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
  the display. Bloom origin is DIP relative to the display's top-left.
- **Full renderer load while the room is open** calls `exitFullscreen()`
  (`did-navigate`). Keep the fresh renderer and window in agreement.
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

## Commands

- `npx nx serve desktop` - renderer dev server and Electron.
- `npx nx build desktop` / `package desktop` / `make desktop`.
- `npx nx test desktop --run` - vitest, node env. Specs import from `vitest`.
- `npx nx lint desktop` - three pre-existing warnings in `events/` are known.
- `npx electron tools/pty-smoke.cjs <path to pty-host.js>` - run on
  `dist/apps/desktop/pty-host.js` and the packaged copy under
  `dist/packages/win-unpacked/resources/app.asar/desktop/pty-host.js`.
- If `nx package desktop` fails with `win-unpacked.tmp` locked, delete it and retry.
