# Design system

[DESIGN.md](../DESIGN.md) is the source of truth for color, type, spacing, shape and component rules. This page only describes how the code applies it.

## Tokens

`src/web/styles/tokens.css` declares every token as a CSS custom property. Color tokens are declared per theme, on `:root, :root[data-theme="dark"]` and on `:root[data-theme="light"]`; everything else sits on `:root`. Tokens: colors (`--color-void`, `--color-graphite`, `--color-signal-blue` and the rest of the DESIGN.md palette), font (`--font-sans`, Inter variable), text sizes (`--text-13` and up), weights, tracking, spacing (`--space-1` to `--space-24`), radii (`--radius-button`, `--radius-card` and others), density tokens (`--gutter` 12px between panes, `--gutter-page` 16px, `--padding-card` 16px, `--padding-panel` 12px, `--row-padding`, `--nav-height` 56px, `--hit-target` 32px, 44px on touch or up to 700px wide), the hairline border and shadows.

The density values are an intentional adaptation of the Refero spec: radii, gutters, paddings and the top bar are tighter than the published values so the viewer gets more of the screen.

Other stylesheets in `src/web/styles` (`global.css`, `shell.css`, `tree.css`, `landing.css`, `model.css`), `src/web/panels/panels.css` and `src/web/layout/dockTheme.css` read these variables. Component styles do not contain raw hex colors or pixel values that have a token.

## Rules

- Change a value in DESIGN.md first, then in `tokens.css`. Do not introduce a one-off value in a component.
- Use `var(--token)` in CSS. Use the neutral tokens for surfaces and text.
- Blue (`--color-signal-blue`, `--color-arc-blue`) marks active state, links, icons and openable tree versions. Green and red are for success and error only. The exception is the three paint swatches, which are user data colors.
- Borders are 0.5px hairlines (`--border-hairline`). No gradients and no heavy shadows.
- Headlines use weight 400. The primary button is the neutral bone fill.
- Version badges in the tree show the view state. Blue marks availability, coral marks failure, everything else is neutral:

| State | Badge | Style |
|---|---|---|
| `ready` | Viewable | arc-blue outline |
| `unknown` | Unchecked | neutral (fog) text with an ash outline; the tooltip says the geometry could not be verified and it may still open |
| `processing` | Processing | neutral (chalk) outline with a spinner that stops under reduced motion |
| `no-geometry` | No 3D or 2D view | muted (ash) text, no outline |
| `not-translated` | Not translated | muted (ash) text, no outline |
| `failed` | Translation failed | coral outline |

  All badges sit right-aligned in the row's trailing slot, share one size and truncate with an ellipsis (at most 60% of the row). Each badge has a tooltip with the reason and the action. Versions that cannot open explain themselves in an aria-live notice when selected.
- Loading, empty and error feedback uses the shared `StateBlock` component, not ad hoc text.
- Interactive controls need an accessible name (`aria-label` or visible text) and a visible focus ring.

## Layout breakpoint and pane containers

There is one layout breakpoint, `STACKED_QUERY` in `src/web/layout/LayoutProvider.tsx`: from 876 px wide the panes are docked, up to 875 px they are stacked in one column with the tree as an overlay. The value keeps the old reasoning (page padding 24 + minimum viewer 560 + gap 12 + minimum summary 280). Stacked-only rules are scoped to the `.stack` class rather than repeated in media queries.

Each docked pane body sits in a `pane` size container (`.pane-slot--dock`), and the stacked column is a `pane` container too, so pane CSS uses `@container pane (...)` and responds to the pane's own width wherever it is placed. The tree keeps its own `tree` container.

## Dock theme

`src/web/layout/dockTheme.css` defines the `bsh-dock` dockview theme. It maps dockview's `--dv-*` variables to our tokens, so dark and light follow `data-theme` with no theme branch: groups are graphite cards with a 0.5 px hairline and the card radius, tabs are 32 px with 13 px labels, the active tab of the focused group has a thin signal-blue underline, sashes are invisible until hovered (smoke), drop targets use the match wash with a signal-blue hairline, and floating groups have a hairline border and no shadow. The gap between groups is the 12 px gutter. A collapsed group shows only its header: a 33 px strip, vertical for panes in a row. Inside the dock the panels drop their own card border and visible title, because the tab already names the pane.

Menus (`src/web/components/Menu.tsx`, used by the pane menus, the top bar Panes menu) are graphite popovers with hairline borders, rendered in a fixed-position portal above floating groups.

## Themes

The app has dark and light themes. The light theme keeps every token role and changes only the values, so components never branch on theme. DESIGN.md has the light palette tables.

- `src/web/theme/theme.ts` holds the `Theme` type, the storage key `bsh-theme` and helpers. `ThemeContext.tsx` provides `ThemeProvider` and `useTheme()` (`theme`, `toggleTheme`). `useTheme` throws outside the provider.
- The theme is the `data-theme` attribute on `<html>`, together with `color-scheme`.
- Without a stored choice the theme follows `prefers-color-scheme`, live, and defaults to dark. Clicking the toggle in the top bar (also on the landing page) stores an explicit choice in `localStorage` under `bsh-theme` and stops following the system.
- An inline script in `index.html` sets the theme before first paint to avoid a flash.
- Tests that render `ViewerPane`, `ChartCanvas`, `DashboardPanel` or `ModelPage` import `render` from `src/web/test/render.tsx`, which wraps the tree in `ThemeProvider`.

## Viewer

The Autodesk Viewer follows the app theme: `dark-theme` or `light-theme`, plus a scene background taken from the `--color-graphite` and `--color-void` tokens. `src/web/viewer/viewer.css` holds the pane, overlay and tool icon styles and the mock viewer uses it too. `src/web/viewer/viewerChrome.css` restyles the native Autodesk chrome, see below. The paint and export controls are a group in the native viewer toolbar (see [architecture.md](architecture.md)).

## Viewer chrome

`src/web/viewer/viewerChrome.css` themes the native Autodesk Viewer 7 UI with the same tokens as the app, so one rule set serves both themes: surfaces are `--color-graphite` and `--color-charcoal`, text `--color-chalk` and `--color-ash`, active state `--color-signal-blue` (`--color-arc-blue` for text), borders 0.5px hairlines, no gradients and no shadows, Inter instead of Artifakt.

Themed: toolbar groups, buttons (idle, hover, active, disabled, `:focus-visible` ring), tooltips, the settings sub menu, docking panels (title, footer, buttons, text box, scrollbars), the Model Browser tree, Properties and Settings panels and their inputs, search and filter boxes, context menus (surface, flex item rows, icon slot, text, shortcut, divider, submenu arrow, hover), the loading spinner, the progress bar and the alert box. Image-based icons (panel close, resizer, tree arrows, visibility eye, search, filter, clear and menu expand) are redrawn as inline SVG masks filled with `currentColor`, so they follow the theme. The tool icons in `viewer.css` use the same pattern.

Deliberately native: the ViewCube faces (WebGL), the environment thumbnails in Settings, the alert illustrations, the Layers and animation icons, the experimental disclaimer in Settings and any CSS injected by extensions.

Why the selectors look long: Autodesk injects its stylesheet at runtime, after ours, and hard-codes colors per theme in `.adsk-viewing-viewer.dark-theme` and `.light-theme` blocks. Every rule is prefixed with `html .bsh-viewer-surface .adsk-viewing-viewer`, which outranks those blocks when the tail selector is the same, so `!important` is used only where Autodesk uses it (tree selection and hover, Settings labels).

To extend: find the selector in the Autodesk stylesheet, add a rule with the scope prefix and the same tail, then add the tail to `UPSTREAM_SELECTORS` in `e2e/viewer_selectors.py` (or to `OWN_SELECTORS` when it does not exist upstream, such as `:focus-visible`). Use tokens only. Check text contrast at 4.5:1 and UI contrast at 3:1 in both themes.

Context menus: Autodesk lays items out as `display: table-row` with a floated `.menu-item-icon` sized `width: 100%; height: 100%`. The themed chrome replaces this with a flex column and flex rows so the icon slot can never grow past its item or sit over the label. Items without an icon class hide the slot. Autodesk has no disabled item state: unavailable actions are left out of the menu.

Version drift: the viewer is loaded as `7.*`, so Autodesk can rename classes at any time. `python3 e2e/viewer_selectors.py` fetches the stylesheet the app loads and fails when a listed selector is gone or when the list and `viewerChrome.css` disagree. `e2e/smoke.py` runs the same check and also asserts computed styles on the live viewer. It accepts a local file path to check against a saved stylesheet.
