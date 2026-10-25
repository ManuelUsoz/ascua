# Components library (apps/renderer/src/app/shared)

Reusable renderer components. One folder per component, each with
`<name>.ts` and usually `<name>.spec.ts`. There is no barrel file: import
by direct path, for example
`import { Button } from '../../shared/button/button'`.

Renderer-wide rules (signals, zoneless, i18n, strict templates) are in
`apps/renderer/CLAUDE.md`.

## Components

| Component          | Selector            | File                           | Notes                                                                                                                                                                                                        |
| ------------------ | ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`           | `button[appButton]` | `button/button.ts`             | Attribute directive on a native button. The `as-btn` look is CSS in `styles/controls.css`.                                                                                                                   |
| `Notice`           | `app-notice`        | `notice/notice.ts`             | Styled by `styles/notice.css`.                                                                                                                                                                               |
| `Character`        | `[appCharacter]`    | `character/character.ts`       | Mounts `@ascua/character` (`libs/character`) into the host.                                                                                                                                                  |
| `Icon`             | `app-icon`          | `icon/icon.ts`                 | Icons come from the `ICONS` map at the top of the file.                                                                                                                                                      |
| `AsSelect`         | `app-select`        | `select/select.ts`             | ControlValueAccessor; use with forms, or without via `selected`/`picked`. Options are strings or `SelectOption` (label/hint keys + icon); rich options render a custom listbox instead of the native select. |
| `ContextMenu`      | `app-context-menu`  | `context-menu/context-menu.ts` | Flat menu at a point: `openAt(x, y)` / `close()`; items are `ContextMenuItem` (icon, label key, `run`, optional `tone: 'danger'`).                                                                           |
| `ConfirmModal`     | `app-confirm-modal` | `modal/modal.ts`               | Native `<dialog>` confirm. Inputs `open`, `title`, `body`, `bodyParams`, `confirmLabel`, `cancelLabel`, `tone`; outputs `confirmed`, `cancelled`.                                                            |
| `Spinner`          | `app-spinner`       | `spinner/spinner.ts`           | Loading indicator.                                                                                                                                                                                           |
| `Breadcrumb`       | `app-breadcrumb`    | `breadcrumb/breadcrumb.ts`     | `visibleCrumbs()` decides what fits.                                                                                                                                                                         |
| `RelativeTimePipe` | pipe                | `time/relative-time.pipe.ts`   | Relative time display.                                                                                                                                                                                       |

## The `as-*` controls are CSS, not components

`src/styles/controls.css` defines `.as-btn` with `--primary`, `--quiet` and
`--ghost` modifiers, `.as-ico`, and the form fields. Use the classes where a
component is not needed. Several feature sheets (`workbench.css`,
`terminals.css`, `settings.css`, `projects.css`, `notice.css`) also use them.

`Button` and `.as-btn` give the same look through two routes. Prefer the
component in templates and the class where you have no component to attach to.

## Adding a component

1. Create `shared/<name>/<name>.ts` as a standalone component or directive
   with a selector that starts `app` (or `appX` for attribute directives).
2. Put any styling in `src/styles/*.css`. Components have no `styleUrl`.
3. All text goes through `| transloco` or `Text`. Never a literal. Add
   keys to both `es.json` and `en.json` in the owning scope.
4. Add a `<name>.spec.ts` that uses `i18nTesting('es')` from `apps/renderer/src/app/testing/i18n.ts`
   and asserts real Spanish text.
5. Guard browser-only APIs (`matchMedia`) so jsdom specs run.

## Checking

`npx nx test renderer --run` for the whole renderer, or
`--testFile=apps/renderer/src/app/shared/<name>/<name>.spec.ts` for one.
`npx nx lint renderer` and `npm run i18n:check` before finishing.
