# BIM Showcase Hub modernization

## Goal

Rebuild the 2023 jQuery and Forge app as a maintainable APS application that works both as a polished public showcase and as a real tool for browsing and inspecting models.

## Stack

- Front end: Vite, React 19, TypeScript.
- TanStack: Router (`/`, `/model/$urn`), Query (hub, project, folder and version loading), Table (Model Summary), Virtual (tree rows).
- Document tree: Headless Tree (`@headless-tree/react`) with async child loading. Fallback: `react-arborist`.
- Back end: Express 5, TypeScript, `@aps_sdk/*` packages. Session secret from environment. Async errors handled centrally. Read-only scopes: `data:read`, `viewables:read`.
- Tooling: Biome (lint and format, both sides), Vitest.
- Viewer: Autodesk Viewer 7 from the Autodesk CDN behind a `ViewerAdapter` interface.
- Charts: Chart.js 4.

## Layout

```
src/server   Express app, auth, data-management routes, mock fixtures
src/web      React app, routes, tree, panels, viewer adapters, extensions
docs         architecture, development, design-system, extensions
```

## Mock mode

`MOCK_APS=1` serves fixture data (user, 2 hubs, projects, nested folders, versions with and without viewables) and skips Autodesk login. The mock `ViewerAdapter` renders a placeholder canvas, a fake toolbar and fixture element data feeding Model Summary, Excel export and the dashboard. Mock mode cannot verify the Autodesk viewer's own toolbar or canvas styling.

## Viewer extensions

Ported to TypeScript: PaintBrushes, Model Summary (property names configurable, not hardcoded), Excel export, dashboard (bar and pie).

## Design

`DESIGN.md` is the source of truth. Tokens live in a single CSS file. The project tree is a collapsible left graphite panel. Viewer uses its dark theme with CSS overrides.

## Documentation

`README.md` rewritten. `docs/architecture.md`, `docs/development.md`, `docs/design-system.md`, `docs/extensions.md`. No code comments.

## Quality gate

A QA agent drives the app in mock mode with Playwright and scores the design against `DESIGN.md`. `/frontend-design:frontend-design` is applied and the app re-scored until the score is at least 9/10, at most 5 rounds.

## Git

Branch `modernize`. All commits dated 2026-11-16. No AI attribution trailers. No push.
