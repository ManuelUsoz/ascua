# Ascua

Ascua is a small desktop companion: a living ember that sits on top of your
desktop and opens into a full-screen room when you double-click it.

This workspace is the Electron/Nx port of the Tauri prototype. It is an Angular
21 renderer inside a single frameless, transparent Electron window.

## Run

```sh
npm start          # nx serve desktop: renderer + Electron, with reload
npx nx build desktop   # renderer + Electron main
npx nx package desktop # Windows app in dist/packages/win-unpacked/ascua.exe
```

Linux: `nx make desktop` on Linux produces an AppImage under
`dist/executables/`. From Windows, `npm run linux:check` builds and tests it in
Docker (Xvfb) and leaves the AppImage and screenshots in `dist/linux/`. The AppImage was only verified with `--no-sandbox` in Docker; on
a real distro run it once without it. On distros that restrict unprivileged user
namespaces for AppImages (e.g. Ubuntu 24.04+ AppArmor,
`kernel.apparmor_restrict_unprivileged_userns`) Chromium's sandbox fails to
start; run with `--no-sandbox` (less secure) or install an AppArmor profile for
the AppImage path.

UI driver: `node tools/ui-drive.cjs dist/ui-drive` (after `nx build desktop`)
runs the Playwright scenarios in `tools/ui-drive/` (room, projects, pistas,
terminals, files, editor, viewports) against the real app and writes
screenshots to the given folder. Run one area with
`node tools/ui-drive.cjs dist/ui-drive --grep editor`.

`desktop:serve` waits for the renderer dev server, and `desktop:build` depends
on `renderer:build`, so one command is enough in both cases.

## Window model

There is exactly **one** `BrowserWindow`.

- **Compact:** 420 x 320 transparent, frameless, always-on-top, skipped from the
  taskbar. The 120 x 120 avatar sits in the bottom-right corner. The rest of the
  window is click-through (except while a permission bubble is visible), so the
  desktop underneath stays usable.
- **Fullscreen:** double-clicking the avatar calls Electron's true OS fullscreen
  (`setFullScreen(true)`). The renderer receives the avatar's screen position as
  the bloom origin and grows the room out of it.
- **Back to compact:** the room's close/minimize button or `Escape` collapses the
  bloom, restores the compact bounds, and returns the window to always-on-top.

The fullscreen room is the Workbench shell: a rail (Proyectos), a projects side
panel, and a bar with breadcrumb and window controls. Projects are stored in
`userData/projects.json`. Each project's Terminales tab runs real `node-pty`
terminals in an Electron `utilityProcess` pty host (Git Bash on Windows,
PowerShell as fallback), with start/stop, Levantar todo/Detener todo, and a
confirmation when quitting with terminals running. `npx nx test desktop` runs
the main-process unit specs.

The Archivos tab edits project text files in place with CodeMirror (Ctrl+S
saves). A save is refused with a conflict banner (Sobrescribir / Recargar) if
the file changed on disk, and unsaved changes show a marker and prompt before
leaving the tab or pressing Close. Files that are not UTF-8 open read-only.
"Abrir en editor" appears only for safe document types; other files (binaries,
executables, scripts) offer "Mostrar en carpeta" instead.

The compact position is remembered in
`%APPDATA%\ascua\position.json` (dev builds use the Electron user-data folder).

## Responsibilities

**Electron main** (`apps/desktop`)

- Owns window geometry, transparency, always-on-top, taskbar visibility, and
  fullscreen.
- Polls the cursor to toggle click-through, keeping the window interactive over
  the avatar and while a permission bubble is visible.
- Implements dragging by sampling the cursor and moving the window (Electron has
  no `start_dragging`).
- Persists and clamps the compact position.
- Exposes a small, typed API over the preload bridge (`window.ascua`).

**Renderer** (`apps/renderer`)

- Mounts and animates the character, including idle/bored/sleep life.
- Renders the room, bloom clip-path, ring, embers, and typography.
- Handles poke, drag intent, double-click, and `Escape`.
- Asks main for fullscreen and applies the returned bloom origin.

**Shared libraries**

- `libs/character` — the 17-act SVG character, CSS animations, and life loop.
- `libs/ascua-ipc` — IPC channel names and shared types (`Layout`,
  `BloomOrigin`, `FullscreenState`, `AscuaApi`).

The character art is all-rights-reserved; see `NOTICE`.

## Fonts

Inter is self-hosted through `@fontsource-variable/inter` and bundled into the
renderer, so the packaged app does not depend on a system font or the network.
JetBrains Mono (`@fontsource-variable/jetbrains-mono`) is bundled the same way
for the terminals.

## Permission bubble

Claude Code's `PermissionRequest` hook is forwarded to Ascua over a user-scoped
named pipe (Windows) or Unix socket. The compact window becomes interactive,
shows a bubble above the avatar, and the avatar changes expression: `alert` for
an ordinary tool, `warn` for destructive commands, and `ask` for
`AskUserQuestion`. Approve/Reject answer the hook; **In terminal** leaves the
decision to Claude Code. Requests queue, and a request that arrives while the
room is open collapses it back to the bubble.

The transport is the Node script `tools/ascua-hook.mjs`; there is no Rust
`ascua-hook.exe`. It fails open: if Ascua is not running, it prints nothing and
Claude Code asks in the terminal as usual.

Add a `PermissionRequest` hook to `.claude/settings.local.json`, pointing at the
absolute path of the script:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node C:\\path\\to\\ascua\\tools\\ascua-hook.mjs",
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

The hook server starts with the Electron main process. In development it uses
the same endpoint as the packaged app, so only one Ascua instance should be
running at a time.

## Notes for Claude Code

"Mis notas" are plain `.md` files in `<userData>/notes`. Claude Code reads them
through a local, read-only MCP server, `tools/ascua-notes-mcp.mjs` (no
dependencies; it never writes). Like the hook, it runs from the repo checkout.

```sh
claude mcp add ascua-notes -- node /absolute/path/to/ascua/tools/ascua-notes-mcp.mjs
```

Without `--dir` the server uses the packaged app's folder:

- Windows: `%APPDATA%\ascua\notes`
- macOS: `~/Library/Application Support/ascua/notes`
- Linux: `~/.config/ascua/notes` (or `$XDG_CONFIG_HOME/ascua/notes`)

In development Electron uses its own userData, so point the server at it with
`--dir` (or `ASCUA_NOTES_DIR`) and an absolute path:

- Windows: `%APPDATA%\Electron\notes`
- macOS: `~/Library/Application Support/Electron/notes`
- Linux: `~/.config/Electron/notes`

```sh
claude mcp add ascua-notes -- node /absolute/path/to/ascua/tools/ascua-notes-mcp.mjs --dir /absolute/path/to/Electron/notes
```

Tools: `list_notes` (names and heading outline), `read_note` (`name`, optional
`heading` to read only that section) and `search_notes` (`query`, up to 50 hits
with the nearest heading and line).

Notes link to each other with `[[Nota#Encabezado]]`, so you can ask Claude Code
things like "lee [[Nota#Encabezado]] de mis notas".
