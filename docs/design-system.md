# Design system

[DESIGN.md](../DESIGN.md) is the source of truth for color, type, spacing, shape and component rules. This page describes how the code applies it.

## Tokens

`src/web/styles/tokens.css` declares every token as a CSS custom property.

- Color tokens are declared per theme, on `:root, :root[data-theme="dark"]` and `:root[data-theme="light"]`.
- Everything else sits on `:root`: fonts, text sizes, spacing (`--space-*`), radii, density (`--gutter`, `--gutter-page`, `--nav-height`, `--hit-target`), `--border-hairline` and shadows.
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
- Pressed toggle buttons (`aria-pressed="true"` on `.btn` or `.bsh-button`) show an arc-blue border and an 18% arc-blue tint. No chromatic fills.
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

Task Center (`.task-center`), the command palette (`.cmdk`) and settings windows (`.settings` blocks in `styles/modal.css`) have shared styles.

Every settings window body is a `.settings` block of `.settings__section` groups (a `fieldset` with a `legend.settings__heading` where the controls form a group). A field is a `.settings__field` row: label on the left, control on the right, hint under the control; below 32rem of window width the row stacks. On and off settings use `SwitchRow` (label and hint on the left, switch on the right). Buttons are `.btn` in a `.settings__actions` row, and saved-item lists use `.settings__override-list`. Do not use the pane toolbar classes (`.bsh-field`, `.bsh-button`, `.bsh-select`) inside a settings window. The in-viewer badge (`.bsh-viewer-badge`) is for Share results only. Slow work reports in the Task Center.

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

## Viewer styling

The Autodesk Viewer follows the app theme: `dark-theme` or `light-theme`, plus a scene background from `--color-graphite` and `--color-void`. `viewer/viewer.css` holds pane, overlay and tool icon styles. The paint and export controls are a group in the native toolbar.

`viewer/viewerChrome.css` restyles the native Autodesk UI (toolbar, panels, menus, alerts) with the same tokens. The ViewCube and CSS injected by extensions stay native.

Autodesk injects its stylesheet after ours and hard-codes colors per theme. Every rule is therefore prefixed with `html .bsh-viewer-surface .adsk-viewing-viewer`, and `!important` is used only where Autodesk uses it.

To add a rule:

1. Find the selector in the Autodesk stylesheet. Add a rule with the scope prefix and the same tail. Use tokens only.
2. Add the tail to `UPSTREAM_SELECTORS` in `e2e/viewer_selectors.py`, or to `OWN_SELECTORS` when it does not exist upstream, such as `:focus-visible`.
3. Check contrast at 4.5:1 for text and 3:1 for UI in both themes.

The viewer loads as `7.*`, so Autodesk can rename classes at any time. `python3 e2e/viewer_selectors.py` fetches the stylesheet the app loads and fails when a listed selector is gone or when the list and `viewerChrome.css` disagree. `e2e/smoke.py` runs the same check.
