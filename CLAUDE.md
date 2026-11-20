# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

bim-showcase-hub is a React single-page client and a thin Express server for browsing Autodesk Platform Services (APS) hubs, opening models in the Autodesk Viewer, and reading their properties as a summary, charts and exports (Excel, CSV, JSON, GLB, IFC).

## Commands

- Node 24, npm. `npm run dev:mock` runs everything without credentials (Express on `:3000`, Vite on `:5173`, which is hard-coded). `npm run dev` uses real APS and needs `.env` (copy `.env.example`); the server must stay on `:3000` because the APS callback is registered there.
- `npm run typecheck`, `npm run lint` (Biome), `npm run format`, `npm test` (Vitest), `npm run build`. CI runs `npx biome check src`, `typecheck` and `test` on pushes to `main` and `dev` and on PRs.
- One test file: `npx vitest run src/web/viewer/modelSet.test.ts`. One test by name: `npx vitest run -t "part of the name"`. One project: `--project server` (Node, `src/server` and `src/shared`) or `--project web` (jsdom, `src/web`).
- Biome style is two spaces and single quotes. Source imports use `.js` extensions. Biome's parser is the only check that catches an unbalanced CSS brace: the build and the tests pass with one.
- In a git worktree, copy `node_modules` with `cp -Rc` instead of symlinking it: a symlink breaks Vite's font allow list.
- macOS is case-insensitive: two files that differ only in case (`AppCommands.ts` and `AppCommands.tsx`) break `tsc`.

## Architecture

Terms such as Layout, Workspace, Preset and Incoming link are defined in `GLOSSARY.md`.

The longer guides are `docs/architecture.md`, `docs/layout.md`, `docs/extensions.md` and `docs/development.md`. The points below need several files to see.

- **Server is a thin proxy.** `createApp` in `src/server/index.ts` serves both the local process and the Vercel function (`api/index.ts`). The client talks only to `/api`. The session is a sealed cookie with no server store: tokens are AES-GCM sealed in it, the 12 hour window renews only together with a token refresh, and 7 days is the absolute cap. Autodesk ids never leave the server raw: `ids.ts` base64url-encodes them and `decodeId` validates them.
- **Mock mode** is `MOCK_APS=1` on the server (fixtures) plus `VITE_MOCK_APS=1` in the client (SVG mock viewer). The mock viewer is a dev-only dynamic import, so a production build has none of it.
- **`ViewerAdapter` is the only way anything reaches a viewer.** `createViewerAdapter` picks `RealViewerAdapter` (Autodesk Viewer 7) or `MockViewerAdapter`. One adapter can hold several models; model ids equal URNs, and dbIds collide across models, so selection is always `{ modelId, dbId }` pairs. Shared behaviour sits in small modules (`propertyReader`, `placement`, `selectionHub`, `viewerState`). Adapter changes need the real adapter, the mock adapter and `fakeFederatedViewer.ts`, plus `adapter.contract.test.ts`.
- **Property rows have one read path.** Summary, Dashboard, the Properties pane and the Excel export all use `readScopedRows` / `useScopedRows` over one per-adapter cache (`viewer/sharedLeafRows.ts`) that keeps completed rows until they are replaced, and marks them stale rather than dropping them. Model scope and element scope (`all`, `selected`, `visible`, `isolated`, `set:<id>`) are applied in one place.
- **Layout.** Documents is the only required pane; viewer tabs, Summary, Dashboard and user-made chart, model summary and properties panes are dock panes (`dockview`) or a stacked column on narrow screens. Each viewer is rendered once into a detached host element and moved between slots, never recreated. `layout/paneLifecycle.ts` owns open, close, instance, lock, present and resize behaviour with no React or dockview in it; `LayoutProvider` only adapts it.
- **Browser storage goes through `src/web/storage.ts` only** (`defineRecord`, `defineRecordFamily`, `usePersisted`, with a browser adapter and an in-memory one for tests). Every key is personal (cleared by `forgetPersonal()` on sign-out) or a preference. A new personal key must be listed in `BSH_KEYS.personal` or live under a registered prefix, or it survives sign-out.
- **Tools and commands are registries.** Toolbar tools are `ViewerTool` classes in `src/web/tools`, each owning its settings and its settings window; app settings hold only app-level fields, and the app shell depends on the registry, never on a concrete tool. The Ctrl/Cmd+K palette merges command lists from the shell, the layout and the active viewer (`COMMANDS`). Long-running work (model loads, exports) reports into the Task Center through `startTask`.
- **User-made items** (dashboard presets, selection sets, viewpoints) are saved items in `store/savedStore.ts`, one personal record with JSON import and export.

## Browser testing

Camoufox is the only browser for end-to-end tests and visual QA in this repo. Do not use Playwright MCP, Chromium, Chrome DevTools MCP or any other browser tool for QA, measurements or screenshots.

- Scripts live in `e2e/` and use the Camoufox Python API. Set up once with `npm run e2e:setup`.
- Mock mode (local only): `NODE_ENV=development npm run dev:mock`, then run `e2e/mock_smoke.py` with `E2E_BASE_URL` pointing at it and a throwaway `E2E_PROFILE_DIR`. It takes several minutes.
- Real APS: the owner signs in to Autodesk manually through `e2e/signin.py`, then `e2e/smoke.py` reuses that persistent profile. Only the main session uses the signed-in profile. Never read, copy or commit it. `smoke.py` accepts browser dialogs, because a large model triggers the 20,000-row export confirm.
- Camoufox runs `page.evaluate` in an isolated world. To reach page globals, launch with `main_world_eval=True` and prefix the expression with `mw:`.
- Ad-hoc measurements and screenshots are written as small Camoufox scripts, not browser tools. Reuse the helpers in `e2e/common.py`.
- Details: `docs/development.md`.
- Background mode is the default: launch Camoufox with `headless=True` so no window takes the foreground. Only `e2e/signin.py` (the owner signs in by hand) and a deliberate visual debugging session use `headless=False`. The Autodesk viewer, fullscreen and WebGL all work headless.
- Real-APS checks use Revit test models, not only the Navisworks file. The owner's test hub has `.rvt` files (Snowdon Towers Sample Architectural, racbasicsampleproject, rmebasicsampleproject, House Design) plus a `.nwd`, `.nwc`, `.dwg` and `.dwf`. Run viewer, summary, export and layout checks on an `.rvt`, and use more than one model for anything about opening several models.
- Real-model checks that need no sign-in (two-legged token and the harness in `e2e/harness/`): `npm run e2e:glb` opens `rac_advanced_sample_project.rvt` (SVF2, in the app's APS bucket) and `E2E_REVIT_URN` selects another model; `npm run e2e:ifc` validates the IFC export with IfcOpenShell (installed in the e2e venv only, never in `package.json`); `npm run e2e:state` checks viewer state capture and restore. Mock mode covers the exporters in `mock_smoke.py`.
- Implementation plans and design specs are local working notes. They live in `docs/superpowers/plans/` and `docs/superpowers/specs/`, which are gitignored: never commit them and never link to them from tracked files.
