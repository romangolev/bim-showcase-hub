# Design system

[DESIGN.md](../DESIGN.md) is the source of truth for color, type, spacing, shape and component rules. This page describes how the code applies it.

## Tokens

`src/web/styles/tokens.css` declares every token as a CSS custom property.

- Color tokens are declared per theme, on `:root, :root[data-theme="dark"]` and `:root[data-theme="light"]`.
- Everything else sits on `:root`: fonts, text sizes, spacing (`--space-*`), radii, density (`--gutter`, `--gutter-page`, `--nav-height`, `--hit-target`), `--border-hairline`, shadows and the z-index scale (`--z-raised` and `--z-sticky` inside a component, then `--z-float`, `--z-drawer-backdrop`, `--z-drawer`, `--z-bar`, `--z-skip`, `--z-popover`, `--z-modal`).
- The density values are tighter than the published spec so the viewer gets more of the screen.
- Text size sets the root font size (`100%`, `112%` or `125%`). Text, spacing, control and row tokens are rem values, so the shell and the dock scale with it. Density multiplies the same tokens through `--density`.

Other stylesheets (`src/web/styles/*.css`, `panels/panels.css`, `layout/dockTheme.css`) read these variables. Components do not use raw hex colors or pixel values that have a token.

## Rules

- Change a value in DESIGN.md first, then in `tokens.css`. No one-off values in components.
- Use `var(--token)` in CSS. Use neutral tokens for surfaces and text.
- Blue (`--color-signal-blue`, `--color-arc-blue`) marks active state, links, icons and openable tree versions. Green and red mean success and error only. The paint swatches are the exception, they are user data.
- Borders are 0.5px hairlines. No gradients and no heavy shadows.
- Headlines use weight 400. The primary button is the neutral bone fill.
- Use `StateBlock` for loading, empty and error states.
- Buttons are `Button` (`variant="primary"`, `size="small"`, `tone`, `loading`), `IconButton` (required `label`) and `ToggleButton` (`pressed`) from `src/web/ui/`, panes included. A pressed toggle shows an accent border and an 18% accent tint (`--ui-accent-tint`). No chromatic fills. The `.btn` and `.icon-button` classes are gone. A non-button element that has to look like one (a `label` around a radio, a static mock-up) takes `buttonClasses()` or `iconButtonClasses` from the same files.
- Quick actions of a pane (copy, download, show all, chart options) sit in one `PaneActionsMenu` dropdown, not in a row of buttons. Menu triggers look like any other button (`triggerVariant` is `icon`, `button` or `unstyled`). `components/Menu.tsx` keeps its data-driven props and renders the `Menu` primitive (`ui/Menu.tsx`, Base UI Menu): disabled entries and the hint are inert items that the arrow keys skip, choosing an entry closes the menu, returns focus to the trigger and then runs the entry, and a context menu (`anchor`) focuses its first item. Popups (`Menu`, `Popover`, `Tooltip`) portal into the trigger's closest `dialog` or fullscreen element, else `body` (`ui/topLayer.ts`); a popup with no trigger (a context menu, the tree preview card) uses the topmost modal `dialog` or the fullscreen element, because a popup in `body` is inert under a modal.
- Popups that hold more than a list of entries (Workspaces, the Task Center, model tint, the tree preview card) are `Popover` (`ui/Popover.tsx`, Base UI Popover, `role="dialog"`). The app class on `PopoverPopup` sets only size and inner layout; the primitive owns position, layer, surface and border. Panes is a `Menu` with a filter field instead (`MenuFilterProvider`, `MenuInput`, `MenuList`): Base UI keeps the DOM focus in the search box and moves the highlight with `aria-activedescendant`, the popup stays `role="dialog"` because it holds the field, and the list is `role="menu"`. Popovers whose entries run a command or open a dialog pass `finalFocus={false}` and return focus to the trigger themselves before the command runs; Escape returns focus, an outside click does not.
- An icon-only `IconButton` with no `title` takes `tooltip`, which shows its `label` on hover and keyboard focus, or the action text it is given when a click does more than the name says (`QuickSettings` shows `Hide controls` or `Show controls` while its name stays `<Pane> controls`). The tooltip lets the pointer through, so it never covers a click target. The top bar actions (Panes, Workspaces, theme, Settings), the QuickSettings toggle and the document tree toggle use it; existing `title` attributes stay where they carry a reason or an e2e locator needs them.
- The Dashboard, the Summary and the Models pane put their header controls in one shared `QuickSettings` panel (`panels/QuickSettings.tsx`). It collapses when the pane is under 560 px wide or 360 px tall and shows again from 600 by 400 px (`useAutoCompact`); a floating toggle overrides the rule for that pane. The controls slide in and out, and while hidden they are inert.
- Every interactive control needs an accessible name and a visible focus ring.

### Accessibility

- Forced colors: `global.css` and `layout/dockTheme.css` keep a `@media (forced-colors: active)` block. Selection and checked items set `forced-color-adjust: none` with `Highlight` and `HighlightText`, buttons and the active tab keep a `ButtonText` or `Highlight` border, and focus uses `outline-color: Highlight`. `e2e/a11y_audit.py` asserts the focused tab outline and the active tab border under emulated forced colors.
- Contrast: text is 4.5:1 and UI is 3:1 in both themes. `src/web/styles/contrast.test.ts` reads the tokens and fails below those ratios.
- Zoom and text size: the shell has to work at 200% zoom (640x400) and at 125% text (1280x800) with no horizontal overflow, no clipped text and a top bar that fits. Below 700 px the top bar hides `.brand__name` and keeps the mark.
- Hit targets: `--hit-target` is `max(44px, …)` under `(pointer: coarse), (max-width: 875px)`, so the whole stacked layout, not only the narrow screen, gets touch-sized controls. Stacked rows, model tabs, model close buttons and the viewer chrome follow it; inline table links (`.bsh-row-pick`) keep their text height.

### Version badges

Tree badges show the view state ([architecture.md](architecture.md#view-state)). They sit right-aligned, share one size and carry a tooltip with the reason.

| State | Badge | Style |
|---|---|---|
| `ready` | Viewable | arc-blue outline |
| `unknown` | Unchecked | neutral text, ash outline |
| `processing` | Processing | neutral outline with a spinner that stops under reduced motion |
| `no-geometry` | No 3D or 2D view | muted text, no outline |
| `not-translated` | Not translated | muted text, no outline |
| `failed` | Translation failed | coral outline |

### Status UI

Task Center (`.task-center`), the command palette list (`.cmdk__*`) and settings windows (`.settings` blocks in `styles/modal.css`) have shared styles.

Every modal is the `Dialog` primitive (`ui/Dialog.tsx`): a native `<dialog>` opened with `showModal()`, with `DialogHeader`, `DialogTitle`, `DialogClose`, `DialogBody` and `DialogFooter`. It closes on Escape, on a press and release on the backdrop and from `DialogClose` (named by `UIStrings.close`), and returns focus to the element that had it before it opened. Sizes are `sm`, `md`, `lg`, `xl` and `command` (the palette). It never closes itself in an effect cleanup, so StrictMode remounts keep it open. Dialogs rendered from their own React root (`promptPresetName`, `saveModelSetPrompt`, `promptSummaryProperty`) wrap themselves in `DetachedUIStrings`. A modal sits in the browser top layer, so the Vercel preview toolbar cannot be reached while one is open; that is accepted.

The main Settings window is two parts (`settings/SettingsShell.tsx`, `.settings-nav`): a vertical tab list of sections on the left and the selected section's options on the right, in a fixed-size `xl` dialog so it does not jump between sections. In the stacked layout it shows the section list first and a section opens with a Back button. The list is the `Tabs` primitive, vertical: the selected tab uses the tree row highlight (ghost fill and a signal-blue start bar) and `Highlight` under forced colours. Sections come from `registerSettingsSection` (`settings/settingsSections.ts`), never from the shell.

Every settings window body is a `.settings` block of `.settings__section` groups (a `fieldset` with a `legend.settings__heading` where the controls form a group). A field is a `Field` with `layout="row"` (`SettingsField` wraps it): label on the left, control on the right, hint under the control; below 32rem of window width the row stacks. On and off settings use `SwitchRow` (label and hint on the left, `Switch` on the right). Buttons are `Button` in a `.settings__actions` row, and lists of rows (saved items, overrides, grouping levels) use `ItemList` and `ItemRow`, whose rows wrap on narrow widths. Inputs and selects outside a settings window are the same `Input` and `Select` primitives. Do not use the quiet pane label (`variant="quiet"`) inside a settings window. The in-viewer badge (`.bsh-viewer-badge`) is for Share results only. Slow work reports in the Task Center.

### Form controls

Form controls are primitives in `src/web/ui/`, and each one is a styled native element, so roles, accessible names, label clicks, the keyboard and form behaviour are the browser's own.

| Primitive | Element | Value API |
|---|---|---|
| `Input`, `Textarea` | `input`, `textarea` | native `value` and `onChange` |
| `NumberField` | `input type="number"` | `value`, `min`, `max`, `onValueCommitted` (a clamped number, on blur or Enter); `integer` (default true, whole numbers) with `round` (`floor` or `nearest`), `emptyValue` (committed when the draft is emptied) and `onDraftChange` (the live typed value) |
| `Select`, `SelectOption` | `select`, `option` | `value`, `onValueChange(value)` |
| `Checkbox`, `Switch` | `input type="checkbox"` (the switch has `role="switch"`) | `checked`, `onCheckedChange(checked)` |
| `Radio`, `RadioGroup` | `input type="radio"`, `fieldset` | the group takes `name`, `value`, `onValueChange(value)`; every radio needs a string `value`, and a radio alone otherwise takes native props |
| `Slider` | `input type="range"` | `value`, `onValueChange(number)` |

- `Field` lays a control out and wires it: `layout` is `stack`, `row` (the settings grid, columns from `--ui-field-label-min` and `--ui-field-label-max`), `inline`, `between` (the switch row) or `wrap`; `variant="quiet"` is the small pane label. Inside a `Field`, `FieldLabel` points at the control, and `FieldHint` and `FieldError` are added to its `aria-describedby`; `invalid` sets `aria-invalid`. `controlId` passes an id the caller already has. A `Field` that holds several controls (a checkbox set, a list of inputs) takes `group`: its controls keep their own ids, and the hint and error describe the field root, which is a `fieldset` or a `role="group"` element.
- A `FieldLabel` with a `layout` is itself the row and wraps its text and its control, as `<label>` did before. `FieldContent` and `FieldTitle` are the text column of a switch row.
- Checked and disabled states are styled with `checked:` and `disabled:`, and the forced-colours rule reads `:checked`, so an uncontrolled control is covered too; a controlled `Checkbox`, `Radio` or `Switch` also writes `data-checked`.
- Colour and file inputs stay native `input` elements.
- A width or a flex rule for a control is app CSS on `[data-slot="input"]`, `[data-slot="select"]` or `[data-slot="number-field"]` in its container (`.bsh-select` caps a pane select at 240px).
- `noLabelWithoutControl` knows the primitives through `inputComponents` in `biome.json`.

### Display primitives

- Tab lists are `Tabs`, `TabsList`, `Tab` and `TabPanel` (`ui/Tabs.tsx`, Base UI Tabs): roving focus, arrows by orientation, Home and End, wrap; pass `activateOnFocus` on the list when the arrows should select. `Tab` variants: `default` (ghost row with an accent bar on the start side when vertical, the bottom when horizontal) and `outline` (the stacked model chips). The settings shell, the stacked model switcher and the landing feature tabs use it; dockview's tabs do not.
- `Badge` (`variant` `outline`, `soft`, `plain` or `chip`, `tone`, `size`, `render` for another element), `Kbd` for shortcut chips and `Spinner` (decorative unless given `label`; stops under reduced motion).
- Panes are `Card` with `CardHeader` and `CardTitle`. A pane that folds is `Drawer` with `DrawerHeader` (sticky) and `DrawerBody`; `collapsed` writes `data-collapsed` and the body folds through the `group/drawer` variant. The open body height is `--ui-drawer-body`, which the stacked layout raises. Pane CSS targets the parts by `data-slot`. The stacked layout's document sheet is also a `Drawer`: its root is `display: contents` and its body is reset to the sheet's own scroll, so the fixed placement and the backdrop stay app CSS. That body also drops the `@container` utility (`container-type: normal`), because a size container is a containing block and a stacking context for the fixed sheet, which drops the sheet under the nav and behind its backdrop.
- `StateBlock` keeps its props and renders `Skeleton` (loading) or `Empty` with `EmptyMedia`, `EmptyContent`, `EmptyTitle` and `EmptyDescription` (empty and error, `tone="danger"`). Its root carries `data-state-block` with the variant. `Hint` renders `Alert` and `AlertDescription`; `ItemList` and `ItemRow` render `List` and `ListItem`.

## Tailwind and `src/web/ui`

New UI is built from the components in `src/web/ui/`. They are shadcn/ui components on Base UI (`@base-ui/react`), styled with Tailwind v4 utilities. Pane styles stay until each one is migrated; the migration status is the table in the design-system skill.

- `src/web/styles/tailwind.css` imports only `tailwindcss/theme` and `tailwindcss/utilities`. There is no Preflight: `global.css` stays the base layer.
- Cascade layers: `tokens.css` declares `@layer properties, theme, base, utilities, effects;` as the first line of the first stylesheet. The element rules of `global.css` (`button { font: inherit }`, `:focus-visible`, `body`) sit in `base`, the utilities in `utilities`, and every other app stylesheet is unlayered. So a primitive's utilities always beat the element rules, and an app class always beats a primitive's utilities, whatever order the chunks load in (pane CSS arrives in lazy chunks after the entry stylesheet). `e2e/bundle_size.py` checks this on the production build after `npm run build`.
- Its `@theme inline reference` block maps the tokens onto utilities and adds no variable of its own: `bg-graphite`, `text-snow`, `border-hairline` (colours), `rounded-button` (radii), `text-13` (text scale), `font-ui` (weights), `tracking-body`, `shadow-float`, `font-sans`. Tailwind's default palette, radii, text scale, weights and shadows are switched off, so `bg-red-500` or `rounded-lg` produce nothing.
- Spacing utilities multiply `--space-unit`, so `p-2` follows density. `border` is the 0.5px hairline width. `min-h-hit`, `h-hit` and `size-hit` are `--hit-target`: every control in `src/web/ui/` uses one of them.
- Themes, density and text size work through the tokens. Do not use `dark:` variants.
- Classes in `src/web/ui/` use token-mapped utilities only. No raw hex values, and no arbitrary `[...]` values where a token exists. A missing token is added to DESIGN.md and `tokens.css` first, then mapped in `tailwind.css` and listed in `ui/cn.ts`.
- Tailwind scans only `src/web/ui/**/*.tsx` and skips the tests there (`@source`, `@source not`). A utility class written anywhere else produces no CSS, and existing class names cannot collide with a utility. So app code never passes a utility in `className` to a primitive: a look comes from the primitive's `variant`, `tone`, `size` and `effect`, and `className` from app code is an app CSS class for placement (grid area, width, margin), which wins over the primitive through the layers. When an element becomes a primitive, its legacy control class (`.btn`, `.field`) is dropped in the same commit.
- Merge classes with `cn()` from `ui/cn.ts` (clsx and tailwind-merge). It knows the token names, so `text-13` (a size) and `text-snow` (a colour) do not cancel each other.
- `src/web/styles/tailwind.test.ts` asserts the main points: no Preflight, no default palette, every mapped name exists in `tokens.css`, `cn()` knows every name, and no file in `src/web/ui/` has a hex value or an arbitrary value.

To add a component, run `npx shadcn@latest add <name>`. `components.json` puts it in `src/web/ui/`. Then, by hand: rename the file to PascalCase, rewrite the imports to relative paths with `.js` extensions (`./cn.js`; the repo has no `@/` alias), replace shadcn's colour classes (`bg-primary`, `ring-ring`, `dark:`) and arbitrary values with token-mapped utilities, and add a render test. `ui/Button.tsx` is the reference.

### Tables

`ui/Table.tsx` holds the table family. Every part is the native element, so the roles and the e2e selectors (`table`, `tbody tr`, `columnheader`) stay what they were.

| Part | Element | Props beyond the contract |
|---|---|---|
| `Table` | `table` | `size` (`small` is the compact density), `fixed` (fixed layout, cells clip with an ellipsis) |
| `TableHeader`, `TableBody` | `thead`, `tbody` | |
| `TableRow` | `tr` | `selected` (`aria-selected` and a fill) |
| `TableHead` | `th scope="col"` | `sticky`, `numeric` |
| `TableSortHead` | `th` with `aria-sort` and a button | `sort` (`ascending`, `descending`, `none`), `onSort`, `indicator` (the caller's icon), `trailing` (a control beside the button, such as the resize handle) |
| `TableCell` | `td`, or `th scope="row"` with `rowHeader` | `numeric` |
| `TableResizeHandle` | `hr` (a focusable separator) at the end edge of a `TableHead` | `label` (required), `value` (width in px), `active` |

- The Summary tables are the only user so far. They keep the `bsh-table` app classes, because `.bsh-table` is shared with the Dashboard tile, the Export preview, the shortcut lists and the printed report. Those app classes win over the primitive's utilities through the layers, so the look did not change.
- The column model comes from `@tanstack/react-table` v9 (`useTable`, with `columnSizingFeature` and `columnResizingFeature` only). Each layout builds a column list (`id`, header, cell, and a `meta` with the cell classes and attributes) and a list of lines in display order; one `Grid` component renders any of them.
- Sorting is not a table feature. `view.sort` (`count` or `value`) is applied in `viewEntries()` and `pivotTree()`, because copy, CSV and the Excel export read the same entries. Header sorting is separate: the flat table and each block of the grouped layout sort by a `TableSortHead` button (ascending, descending, back to the view order), and the state lives in the table instance, so a preset or a share link never stores it. Pivot and decorative tables offer no sorting, because their row order is the hierarchy or the mock-up.
- Column resizing: every Summary header has a handle named `Resize <column> column`. Until a handle is used the table keeps the automatic layout. The first drag or arrow key measures every column, switches the table to the fixed layout at those widths and then changes the one column (16 px per arrow key, 48 to 1600 px). A double click or Enter on any handle returns the table to automatic widths. Widths live in the table instance only: they are not stored and each grouped block has its own. The header cell carries its name in `aria-label`, so the handle does not become part of the column name. The stacked layout hides the handles, and a `decorative` table has none.
- Rows are not virtualised. The Summary caps a table at 500 rows per property and shows the rest on request; the Properties pane reads at most 20 elements and renders one table per property category. Virtualising either would remove off-screen rows from the DOM, and with them the per-row pick and Copy buttons, so Tab and the screen-reader table commands would stop reaching a row that is not in the window; the caps keep the DOM bounded without that loss.

### Effects

An effect is a name in a primitive's `effect` prop, written to the DOM as `data-effect`. Its CSS lives in `src/web/ui/effects.css` (the `effects` layer, above the utilities and below app CSS) and reads `--ui-*` tokens. No primitive changes to gain an effect.

| Effect | Tokens | CSS channel |
|---|---|---|
| `glow` | `--ui-glow-color`, `--ui-glow-size` | `filter: drop-shadow(...)` through the non-inheriting `--ui-effect` property |

- One element: `<Button effect="glow">`. One element with its own look: add `style={{ '--ui-glow-size': '16px' }}`.
- A theme switches an effect on for chosen slots in its pack: `:root[data-theme="neon"] :where([data-slot="button"]) { --ui-effect: var(--ui-glow); }`, or only changes the tokens.
- `--ui-effect` is registered with `inherits: false`, so a glowing container does not make the primitives inside it glow. Checked in Camoufox: the glow paints, a child of a glowing element computes `filter: none`, a per-element token override applies, and forced colours switch the filter off.
- `filter` makes the element a containing block for `position: fixed` descendants while the effect is on. Do not put an effect on a container that holds a fixed-position child.
- A new effect takes one rule on `[data-effect~="<name>"]`, its own `--ui-<name>-*` tokens in DESIGN.md and `tokens.css`, and a CSS property no other effect uses. A second filter effect is composed into `--ui-effect` in the same rule. Animated effects go inside `@media (prefers-reduced-motion: no-preference)`.

### Progress and toasts

- `Progress` (`ui/Progress.tsx`, Base UI Progress) is a `progressbar` named by its required `label`. `value` is a number up to `max` (100 by default); `null` or no value makes it indeterminate, a dimmed full bar that pulses only without reduced motion. The indeterminate `aria-valuetext` comes from the optional `valueText` prop, so no English is built in. Task Center rows and the summary read progress use it.
- `Toast` (`ui/Toast.tsx`) is the card: `tone` (the `Tone` values plus `warning`, which reads `--ui-warning`) colours the `icon`, `title` and `description` are props, and children are the actions. `Toaster` shows its keyed `Toast` children through Sonner, which supplies the stacking, the swipe and the motion; Sonner's own CSS turns its motion off under reduced motion. Toasts stay until their child leaves; timing is the caller's. `label` names the region, `visible` caps the stack, `live="off"` silences Sonner's live region when the caller announces on its own, and `onDismiss(key)` reports a swipe. Sonner's focus hotkey is off, so the region's name is exactly `label` and no key press moves focus into the stack; the toasts are reached with Tab. It portals into the open modal `dialog` or the fullscreen element, else `body`, and follows them as they open and close, because a toast in `body` is inert under a modal and hidden behind fullscreen.
- Only `src/web/ui` imports `sonner`. The app keeps its own notification store (`tasks/notifications.ts`); `NotificationHost` renders its items as `Toast` children of one `Toaster`. A task started with `startTask({ notify: true })` also raises a toast when it finishes, warns or fails (not when cancelled), with the task's announcement text as the message and its detail; the toast takes over the announcement, so it is heard once. Exports (`runOnce` in `tools/kernel/exportKit.ts`) and the IFC batch opt in. The Task Center stays the record: it lists the task whether or not a toast was shown or dismissed.

### Import boundaries

The UI has three layers: tokens (`styles/tokens.css`, mapped in `styles/tailwind.css`), primitives (`src/web/ui/`) and app components (`components/`, `panels/` and the other feature folders). A primitive knows nothing about the app, so any of them can be restyled, themed or replaced without touching a feature. Biome enforces this with `noRestrictedImports` overrides in `biome.json`:

| Where | Rule |
|---|---|
| `src/web/ui/**` | Imports only `react`, `react-dom`, `@base-ui/react/*`, `clsx`, `tailwind-merge`, `sonner` and files inside `src/web/ui/`. Nothing from the app: no `components`, `panels`, `layout`, `viewer`, `api`, `store`, `settings`, `tools`, `commands`, `modal`, `i18n`, `storage`. Type-only imports count too. Tests there may also import `vitest` and `@testing-library/*`. |
| Everything else in `src/web/**` | Never imports `@base-ui/react` or `sonner`. Use a primitive from `src/web/ui/`, or add one. |
| `src/web/**` outside `src/web/viewer/` | Never imports `viewer/RealViewerAdapter.js`, `viewer/autodesk.js`, `viewer/autodeskTools.js` or `viewer/fakeFederatedViewer.js`. The viewer is reached through `ViewerAdapter` and `createViewerAdapter`. Tests may use `MockViewerAdapter` and `mockModel`. |

A primitive therefore gets every user-visible string as a prop, and its colours, radii and motion from tokens.

`npx biome check src` reports a violation with the rule's message. `src/web/importBoundaries.test.ts` runs the same rule over `src/web` inside `npm test`, and lints probe files against a copy of `biome.json` to prove that each rule still fires. When a rule changes, change `biome.json`, the probe lists in that test and this table together. Biome applies only the last override that matches a file. The app override and the viewer override cover disjoint files and repeat the same Base UI pattern (the test compares them); the `src/web/ui/**` override and the later one for the tests in it overlap on purpose, and the later one wins for tests. The test also scans `src/web` outside `src/web/ui` for the text `@base-ui/react` and for a quoted `sonner`, which covers `vi.mock` and anything else Biome does not read as an import, runs a known-forbidden canary in every probe run, and fails if `src/web/ui` grows a sub-folder: primitives stay flat, because the rule forbids `../` imports.

## Layout breakpoint

One breakpoint: `STACKED_QUERY` in `src/web/layout/breakpoint.ts` (`STACKED_MAX_WIDTH = 875`), re-exported by `LayoutProvider.tsx`. From 876 px wide panes are docked. Up to 875 px they stack in one column. Stacked-only rules use the `.stack` class.

The `--hit-target` token follows the same breakpoint: `(pointer: coarse), (max-width: 875px)` enlarges it to at least 44px, so every control in the stacked layout is touch-sized. The value comes from `STACKED_MAX_WIDTH`, and `settings/appearance.test.tsx` asserts `tokens.css` still carries the query.

Each docked pane body is a `pane` size container, so pane CSS uses `@container pane (...)` and responds to its own width. The tree is a separate `tree` container.

## Dock theme

`src/web/layout/dockTheme.css` maps dockview's `--dv-*` variables to our tokens, so both themes work without a theme branch.

## Themes

Dark and light share every token role and change only values, so components never branch on theme.

- `theme/theme.ts` holds the `Theme` type and the legacy `bsh-theme` key. `ThemeContext.tsx` provides `useTheme()` (`theme`, `preference`, `setTheme`, `toggleTheme`). It throws outside the provider.
- The theme is the `data-theme` attribute on `<html>`, together with `color-scheme`.
- The choice is `theme` in app settings (`bsh-settings-v1`): `system`, `light` or `dark`. `system` follows `prefers-color-scheme` live; the top bar toggle stores an explicit choice. An inline script in `index.html` reads the setting, and the legacy `bsh-theme` key until it is migrated, then sets the theme before first paint.
- Tests that render themed components import `render` from `src/web/test/render.tsx`.

### Theme packs

Primitives read role tokens (`--ui-*`, listed in DESIGN.md), which alias the palette on `:root`. A theme overrides palette tokens, role tokens or both, and no component changes.

To add a theme:

1. `src/web/styles/themes/<id>.css` with one block `:root[data-theme="<id>"] { color-scheme: dark; ... }`. `main.tsx` loads every file in that folder eagerly.
2. One entry in `THEMES` in `theme/theme.ts` (`id`, `scheme`, `color` for the browser chrome) and the same entry in the `themes` literal of the prepaint script in `index.html`; `theme/prepaint.test.ts` compares the two.
3. A label for the settings option in `i18n/en.ts` and `i18n/ru.ts`, wired in `THEME_LABELS` in `settings/sections.tsx` (the type makes it required).

`scheme` is what the Autodesk Viewer, the charts and the top bar toggle follow (`useTheme().scheme`); `theme` is the pack id. `styles/themes.test.tsx` builds a throwaway third theme and asserts that every role resolves, that the contrast pairs pass (`styles/roleContrast.ts`), and that primitives render the same DOM under it. It also checks every shipped pack against `THEMES`.

## Viewer styling

The Autodesk Viewer follows the app theme: `dark-theme` or `light-theme`, plus a scene background from `--color-graphite` and `--color-void`. `viewer/viewer.css` holds pane, overlay and tool icon styles. The paint and export controls are a group in the native toolbar.

`viewer/viewerChrome.css` restyles the native Autodesk UI (toolbar, panels, menus, alerts) with the same tokens. The ViewCube and CSS injected by extensions stay native.

Autodesk injects its stylesheet after ours and hard-codes colors per theme. Every rule is therefore prefixed with `html .bsh-viewer-surface .adsk-viewing-viewer`, and `!important` is used only where Autodesk uses it.

To add a rule:

1. Find the selector in the Autodesk stylesheet. Add a rule with the scope prefix and the same tail. Use tokens only.
2. Add the tail to `UPSTREAM_SELECTORS` in `e2e/viewer_selectors.py`, or to `OWN_SELECTORS` when it does not exist upstream, such as `:focus-visible`.
3. Check contrast at 4.5:1 for text and 3:1 for UI in both themes.

The viewer loads as `7.*`, so Autodesk can rename classes at any time. `python3 e2e/viewer_selectors.py` fetches the stylesheet the app loads and fails when a listed selector is gone or when the list and `viewerChrome.css` disagree. `e2e/smoke.py` runs the same check.
