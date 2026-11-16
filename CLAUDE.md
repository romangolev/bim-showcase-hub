# bim-showcase-hub

## Browser testing

Camoufox is the only browser for end-to-end tests and visual QA in this repo. Do not use Playwright MCP, Chromium, Chrome DevTools MCP or any other browser tool for QA, measurements or screenshots.

- Scripts live in `e2e/` and use the Camoufox Python API. Set up once with `npm run e2e:setup`.
- Mock mode (local only): `NODE_ENV=development npm run dev:mock`, then run `e2e/mock_smoke.py` with `E2E_BASE_URL` pointing at it and a throwaway `E2E_PROFILE_DIR`.
- Real APS: the owner signs in to Autodesk manually through `e2e/signin.py`, then `e2e/smoke.py` reuses that persistent profile. Only the main session uses the signed-in profile. Never read, copy or commit it.
- Camoufox runs `page.evaluate` in an isolated world. To reach page globals, launch with `main_world_eval=True` and prefix the expression with `mw:`.
- Ad-hoc measurements and screenshots are written as small Camoufox scripts, not browser tools. Reuse the helpers in `e2e/common.py`.
- Details: `docs/development.md`.
