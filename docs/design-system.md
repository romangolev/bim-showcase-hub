# Design system

[DESIGN.md](../DESIGN.md) is the source of truth for color, type, spacing, shape and component rules. This page only describes how the code applies it.

## Tokens

`src/web/styles/tokens.css` declares every token as a CSS custom property on `:root`: colors (`--color-void`, `--color-graphite`, `--color-signal-blue` and the rest of the DESIGN.md palette), font (`--font-sans`, Inter variable), text sizes (`--text-13` and up), weights, tracking, spacing (`--space-1` to `--space-24`), radii (`--radius-button`, `--radius-card` and others), the hairline border and shadows.

Other stylesheets in `src/web/styles` (`global.css`, `shell.css`, `tree.css`, `landing.css`, `model.css`) and `src/web/panels/panels.css` read these variables. Component styles do not contain raw hex colors or pixel values that have a token.

## Rules

- Change a value in DESIGN.md first, then in `tokens.css`. Do not introduce a one-off value in a component.
- Use `var(--token)` in CSS. Use the neutral tokens for surfaces and text.
- Blue (`--color-signal-blue`, `--color-arc-blue`) marks active state, links, icons and openable tree versions. Green and red are for success and error only. The exception is the three paint swatches, which are user data colors.
- Borders are 0.5px hairlines (`--border-hairline`). No gradients and no heavy shadows.
- Headlines use weight 400. The primary button is the neutral bone fill.
- Loading, empty and error feedback uses the shared `StateBlock` component, not ad hoc text.
- Interactive controls need an accessible name (`aria-label` or visible text) and a visible focus ring.

## Viewer

The Autodesk Viewer runs in its dark theme. `src/web/viewer/viewer.css` overrides its styling to match the tokens. The mock viewer uses the same stylesheet.
