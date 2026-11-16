# Design system

[DESIGN.md](../DESIGN.md) is the source of truth for color, type, spacing, shape and component rules. This page only describes how the code applies it.

## Tokens

`src/web/styles/tokens.css` declares every token as a CSS custom property. Color tokens are declared per theme, on `:root, :root[data-theme="dark"]` and on `:root[data-theme="light"]`; everything else sits on `:root`. Tokens: colors (`--color-void`, `--color-graphite`, `--color-signal-blue` and the rest of the DESIGN.md palette), font (`--font-sans`, Inter variable), text sizes (`--text-13` and up), weights, tracking, spacing (`--space-1` to `--space-24`), radii (`--radius-button`, `--radius-card` and others), density tokens (`--gutter` 12px between panes, `--gutter-page` 16px, `--padding-card` 16px, `--padding-panel` 12px, `--row-padding`, `--nav-height` 56px, `--hit-target` 32px, 44px on touch or up to 700px wide), the hairline border and shadows.

The density values are an intentional adaptation of the Refero spec: radii, gutters, paddings and the top bar are tighter than the published values so the viewer gets more of the screen.

Other stylesheets in `src/web/styles` (`global.css`, `shell.css`, `tree.css`, `landing.css`, `model.css`) and `src/web/panels/panels.css` read these variables. Component styles do not contain raw hex colors or pixel values that have a token.

## Rules

- Change a value in DESIGN.md first, then in `tokens.css`. Do not introduce a one-off value in a component.
- Use `var(--token)` in CSS. Use the neutral tokens for surfaces and text.
- Blue (`--color-signal-blue`, `--color-arc-blue`) marks active state, links, icons and openable tree versions. Green and red are for success and error only. The exception is the three paint swatches, which are user data colors.
- Borders are 0.5px hairlines (`--border-hairline`). No gradients and no heavy shadows.
- Headlines use weight 400. The primary button is the neutral bone fill.
- Loading, empty and error feedback uses the shared `StateBlock` component, not ad hoc text.
- Interactive controls need an accessible name (`aria-label` or visible text) and a visible focus ring.

## Themes

The app has dark and light themes. The light theme keeps every token role and changes only the values, so components never branch on theme. DESIGN.md has the light palette tables.

- `src/web/theme/theme.ts` holds the `Theme` type, the storage key `bsh-theme` and helpers. `ThemeContext.tsx` provides `ThemeProvider` and `useTheme()` (`theme`, `toggleTheme`). `useTheme` throws outside the provider.
- The theme is the `data-theme` attribute on `<html>`, together with `color-scheme`.
- Without a stored choice the theme follows `prefers-color-scheme`, live, and defaults to dark. Clicking the toggle in the top bar (also on the landing page) stores an explicit choice in `localStorage` under `bsh-theme` and stops following the system.
- An inline script in `index.html` sets the theme before first paint to avoid a flash.
- Tests that render `ViewerPane`, `ChartCanvas`, `DashboardPanel` or `ModelPage` import `render` from `src/web/test/render.tsx`, which wraps the tree in `ThemeProvider`.

## Viewer

The Autodesk Viewer follows the app theme: `dark-theme` or `light-theme`, plus a scene background taken from the `--color-graphite` and `--color-void` tokens. `src/web/viewer/viewer.css` overrides its styling to match the tokens, and the mock viewer uses the same stylesheet. The paint and export controls are a group in the native viewer toolbar (see [architecture.md](architecture.md)).
