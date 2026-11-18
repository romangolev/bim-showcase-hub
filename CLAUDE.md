# bim-showcase-hub

## Browser testing

Camoufox is the only browser for end-to-end tests and visual QA in this repo. Do not use Playwright MCP, Chromium, Chrome DevTools MCP or any other browser tool for QA, measurements or screenshots.

- Scripts live in `e2e/` and use the Camoufox Python API. Set up once with `npm run e2e:setup`.
- Mock mode (local only): `NODE_ENV=development npm run dev:mock`, then run `e2e/mock_smoke.py` with `E2E_BASE_URL` pointing at it and a throwaway `E2E_PROFILE_DIR`.
- Real APS: the owner signs in to Autodesk manually through `e2e/signin.py`, then `e2e/smoke.py` reuses that persistent profile. Only the main session uses the signed-in profile. Never read, copy or commit it.
- Camoufox runs `page.evaluate` in an isolated world. To reach page globals, launch with `main_world_eval=True` and prefix the expression with `mw:`.
- Ad-hoc measurements and screenshots are written as small Camoufox scripts, not browser tools. Reuse the helpers in `e2e/common.py`.
- Details: `docs/development.md`.
- Background mode is the default: launch Camoufox with `headless=True` so no window takes the foreground. Only `e2e/signin.py` (the owner signs in by hand) and a deliberate visual debugging session use `headless=False`. The Autodesk viewer, fullscreen and WebGL all work headless.
- Real-APS checks use Revit test models, not only the Navisworks file. The owner's test hub has `.rvt` files (Snowdon Towers Sample Architectural, racbasicsampleproject, rmebasicsampleproject, House Design) plus a `.nwd`, `.nwc`, `.dwg` and `.dwf`. Run viewer, summary, export and layout checks on an `.rvt`, and use more than one model for anything about opening several models.
- The GLB geometry export has a real-model check that needs no sign-in: `npm run e2e:glb` opens `rac_advanced_sample_project.rvt` (SVF2, in the app's APS bucket) through a two-legged token and the harness in `e2e/harness/`. `E2E_REVIT_URN` selects another model. Mock mode covers the same exporter in `mock_smoke.py`.
- `npm run e2e:ifc` validates the IFC export on the real Revit sample with IfcOpenShell (installed in the e2e venv only, never in `package.json`), using the same harness and two-legged token.
- Implementation plans and design specs are local working notes. They live in `docs/superpowers/plans/` and `docs/superpowers/specs/`, which are gitignored: never commit them and never link to them from tracked files.
