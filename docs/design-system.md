# Design system

[DESIGN.md](../DESIGN.md) is the source of truth for color, type, spacing, shape and component rules. This page describes how the code applies it.

## Tokens

`src/web/styles/tokens.css` declares every token as a CSS custom property.

- Color tokens are declared per theme, on `:root, :root[data-theme="dark"]` and `:root[data-theme="light"]`.
- Everything else sits on `:root`: fonts, text sizes, spacing (`--space-*`), radii, density (`--gutter`, `--gutter-page`, `--nav-height`, `--hit-target`), `--border-hairline` and shadows.
- The density values are tighter than the published spec so the viewer gets more of the screen.

Other stylesheets (`src/web/styles/*.css`, `panels/panels.css`, `layout/dockTheme.css`) read these variables. Components do not use raw hex colors or pixel values that have a token.

## Rules

- Change a value in DESIGN.md first, then in `tokens.css`. No one-off values in components.
- Use `var(--token)` in CSS. Use neutral tokens for surfaces and text.
- Blue (`--color-signal-blue`, `--color-arc-blue`) marks active state, links, icons and openable tree versions. Green and red mean success and error only. The paint swatches are the exception, they are user data.
- Borders are 0.5px hairlines. No gradients and no heavy shadows.
- Headlines use weight 400. The primary button is the neutral bone fill.
- Use `StateBlock` for loading, empty and error states.
- Every interactive control needs an accessible name and a visible focus ring.

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

### Overlays and status

- Task Center: `.task-center` in `styles/shell.css`. Rows carry `data-state`. Failure uses coral and "Done with warnings" uses ember.
- Command palette: `.cmdk` in `styles/commands.css`, a native `dialog`.
- Settings windows: the `.settings` blocks in `styles/modal.css`. Generated forms (`SettingsForm`) use the same blocks.
- The in-viewer badge (`.bsh-viewer-badge`) is short-lived feedback for Share results only. Slow work reports in the Task Center.
- The no-hubs hint is `components/tree/NoHubsHint.tsx`, built on `StateBlock`.

## Layout breakpoint

One breakpoint: `STACKED_QUERY` in `src/web/layout/LayoutProvider.tsx`. From 876 px wide panes are docked. Up to 875 px they stack in one column. Stacked-only rules use the `.stack` class.

Each docked pane body is a `pane` size container, so pane CSS uses `@container pane (...)` and responds to its own width. The tree is a separate `tree` container.

## Dock theme

`src/web/layout/dockTheme.css` defines the `bsh-dock` dockview theme. It maps dockview's `--dv-*` variables to our tokens, so both themes work without a theme branch. Groups are graphite cards with a hairline. The active tab has a signal-blue underline. Menus (`components/Menu.tsx`) render in a fixed-position portal above floating groups.

## Themes

Dark and light share every token role and change only values, so components never branch on theme.

- `theme/theme.ts` holds the `Theme` type and storage key `bsh-theme`. `ThemeContext.tsx` provides `useTheme()` (`theme`, `toggleTheme`). It throws outside the provider.
- The theme is the `data-theme` attribute on `<html>`, together with `color-scheme`.
- Without a stored choice it follows `prefers-color-scheme`, live, and defaults to dark. The top bar toggle stores an explicit choice.
- An inline script in `index.html` sets the theme before first paint.
- Tests that render themed components import `render` from `src/web/test/render.tsx`.

## Viewer styling

The Autodesk Viewer follows the app theme: `dark-theme` or `light-theme`, plus a scene background from `--color-graphite` and `--color-void`. `viewer/viewer.css` holds pane, overlay and tool icon styles. The paint and export controls are a group in the native toolbar.

`viewer/viewerChrome.css` restyles the native Autodesk UI with the same tokens: toolbar, tooltips, docking panels, Model Browser, Properties, context menus, spinner and alerts. Image icons are redrawn as inline SVG masks filled with `currentColor`. Some parts stay native: the ViewCube, environment thumbnails and CSS injected by extensions.

Autodesk injects its stylesheet after ours and hard-codes colors per theme. Every rule is therefore prefixed with `html .bsh-viewer-surface .adsk-viewing-viewer`, and `!important` is used only where Autodesk uses it.

To add a rule:

1. Find the selector in the Autodesk stylesheet. Add a rule with the scope prefix and the same tail. Use tokens only.
2. Add the tail to `UPSTREAM_SELECTORS` in `e2e/viewer_selectors.py`, or to `OWN_SELECTORS` when it does not exist upstream, such as `:focus-visible`.
3. Check contrast at 4.5:1 for text and 3:1 for UI in both themes.

The viewer loads as `7.*`, so Autodesk can rename classes at any time. `python3 e2e/viewer_selectors.py` fetches the stylesheet the app loads and fails when a listed selector is gone or when the list and `viewerChrome.css` disagree. `e2e/smoke.py` runs the same check.
