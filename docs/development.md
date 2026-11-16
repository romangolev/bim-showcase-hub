# Development

## Requirements

- Node 24 (`engines` pins `24.x`).
- npm.
- For end-to-end tests only: [uv](https://docs.astral.sh/uv/) and Python 3.12.

## Setup

```bash
npm install
npm run dev:mock
```

`npm run dev` starts two processes with `concurrently`: the Express server (`tsx watch src/server/index.ts`, port `PORT`, default 3000) and Vite on port 5173. Vite proxies `/api` to the server. Open http://localhost:5173.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Server and Vite with real APS credentials |
| `npm run dev:mock` | Same, with `MOCK_APS=1` and `VITE_MOCK_APS=1` |
| `npm run build` | Type-check the web app, `vite build` to `dist/web`, compile the server to `dist/server` |
| `npm start` | `node dist/server/index.js` |
| `npm run lint` | `biome check .` |
| `npm run format` | `biome check --write .` |
| `npm run typecheck` | `tsc` for `tsconfig.server.json` and `tsconfig.web.json` |
| `npm test` | `vitest run` |
| `npm run e2e:setup` | Create `e2e/.venv`, install Camoufox, download the browser |
| `npm run e2e:signin` | Open a window to sign in once |
| `npm run e2e:smoke` | Smoke test against the real app |

## Biome

Biome handles formatting, linting and import order: two-space indent, single quotes. `docs`, `dist`, `node_modules`, `package-lock.json` and `DESIGN.md` are excluded (see `biome.json`). Run `npm run lint` before committing.

## Theme in development

The theme lives in `src/web/theme`. State is `document.documentElement.dataset.theme` (`dark` or `light`) and the `bsh-theme` key in `localStorage`. Add or change color values per theme in `src/web/styles/tokens.css` (the `:root[data-theme="dark"]` and `:root[data-theme="light"]` blocks) and document them in DESIGN.md. To try the other theme, click the toggle in the top bar or run `localStorage.removeItem('bsh-theme')` to go back to following the system. Tests that need `useTheme` import `render` from `src/web/test/render.tsx`.

## Layout in development

The layout is saved in `localStorage` under `bsh.layout.v2` (a `bsh.layout.v1` record is migrated once), and the open model tabs in `sessionStorage` under `bsh.models.open`. Run `localStorage.removeItem('bsh.layout.v2')` or use Reset layout in the top bar Panes menu to get the default arrangement back; `sessionStorage.removeItem('bsh.models.open')` forgets the open tabs. In mock mode `window.__bshLayout` exposes the layout API (`movePane`, `togglePane`, `setCollapsed`, `resetLayout`, `openPanes`, `location`, `mode`, `read`, `models`, `activateModel`, `closeModel`); it does not exist in a production build. The mock viewer returns a slightly different number of rows per URN, so the summary changes between open models. See [layout.md](layout.md).

## Vitest

`vitest.config.ts` defines two projects. `server` runs `src/server/**/*.test.ts` and `src/shared/**/*.test.ts` in Node. `web` runs `src/web/**/*.test.{ts,tsx}` in jsdom with Testing Library. `vitest.setup.ts` installs a no-op `ResizeObserver` when jsdom has none, so the real dockview runs in layout tests. Server routes are tested with supertest. The viewer adapter contract is tested against the mock adapter.

## Environment variables

Copy `.env.example` to `.env`. `.env` is gitignored.

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `APS_CLIENT_ID` | server | empty | Required in production unless mock |
| `APS_CLIENT_SECRET` | server | empty | Required in production unless mock. Never commit it |
| `APS_CALLBACK_URL` | server | `http://localhost:3000/api/auth/callback` | Must match the callback registered in the APS app exactly |
| `SESSION_SECRET` | server | random per start in development | Required in production. `change-me` is rejected in production |
| `MOCK_APS` | server | `0` | `1` enables mock data. Ignored when `NODE_ENV=production` |
| `VITE_MOCK_APS` | web | unset | `1` enables the mock viewer. Works only in the Vite dev server. `npm run dev:mock` sets it |
| `PORT` | server, Vite proxy | `3000` | Server port. Vite reads it to find the server |
| `NODE_ENV` | server | `development` | `production` turns on secure cookies, static serving and the strict checks |
| `STATIC_DIR` | server | `dist/web` next to the compiled server | Only read in production |

When developing with real credentials, run the server on port 3000 so the default `APS_CALLBACK_URL` works. Sign-in redirects to Autodesk and back to the server port, then to `/`. Register `http://localhost:3000/api/auth/callback` in the APS app.

### Mock mode is development only

Mock mode needs `MOCK_APS=1` and a non-production `NODE_ENV`. The server computes `mock = !production && MOCK_APS === '1'`, so a production process with `MOCK_APS=1` still uses real APS. The client mock viewer additionally requires `import.meta.env.DEV`, so it is not reachable from a production build. In mock mode every request is signed in as "Alex Rivera" and no Autodesk call is made. The mock viewer can hold several models (one SVG group each); a urn containing `broken` fails to load, `nogeom` fails with the no-geometry message and `noprops` fails its property read, so per-model errors can be tested.

## End-to-end tests

Camoufox is the only browser used for end-to-end tests and visual QA in this repo. Do not use Playwright MCP or Chromium. The same rule is in `CLAUDE.md`. Camoufox runs `page.evaluate` in an isolated world, so reading page globals needs `main_world_eval=True` and the `mw:` prefix. The way to test the real app is Camoufox, a Firefox build driven through Playwright's Python API. The owner signs in to Autodesk once, in a persistent browser profile. The scripts reuse that session. They never see or type credentials.

### Setup

```bash
npm run e2e:setup
```

This runs:

```bash
uv venv e2e/.venv --python 3.12
uv pip install --python e2e/.venv/bin/python -r e2e/requirements.txt
e2e/.venv/bin/python -m camoufox fetch
```

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:5173` | App under test |
| `E2E_PROFILE_DIR` | `e2e/.profile` | Persistent Camoufox profile used by `signin.py` and `smoke.py` |
| `E2E_OUTPUT_DIR` | `e2e/output` | Screenshots, downloads and JSON reports |
| `E2E_HEADLESS` | `1` | `smoke.py` and `mock_smoke.py` run headless; `0` shows the window. `signin.py` is always headed |

### Exit codes

| Code | Meaning |
|---|---|
| 0 | All checks passed |
| 1 | A check failed, the app was unreachable, or sign-in timed out |
| 2 | Not signed in (`smoke.py` only) |

### Scripts

`e2e/common.py` holds the shared helpers: `Checks` (result list and report), `watch` (console, page error and failed request listeners), `expand_to_viewable`, `wrapped_count_cells`, `horizontal_overflow`, `download_export`, `app_reachable`, and the `DESKTOP` (1440x900) and `MOBILE` (390x844) sizes.

**signin.py** (`npm run e2e:signin`). Opens a visible window on `E2E_BASE_URL` with the persistent profile. Sign in to Autodesk in that window. The script polls `/api/session` for up to 15 minutes, prints the signed-in name and exits 0. Run it against the same `E2E_BASE_URL` you will test, because the session cookie is per origin.

**smoke.py** (`npm run e2e:smoke`). Reuses the profile and checks the real app:

- the session is signed in (exit 2 if not)
- `/api/health` reports `mock: false`
- `/api/viewer/token` returns a token
- a viewable model exists (found through the API within a budget of 40 calls)
- the tree lists hubs
- clicking through the tree opens the model route
- the document title names the file
- the viewer tab is named after the file and the pane has no breadcrumb header
- the Autodesk viewer mounts and its toolbar is present
- the summary has rows
- summary counts never wrap
- the page has no horizontal overflow
- the Excel export downloads an xlsx
- the native viewer chrome is themed (control group uses the graphite token with no shadow, button hover is not Autodesk cyan, tooltips are not capitalized, docking panels use Inter) and every selector in `viewerChrome.css` still exists in the Autodesk stylesheet (`e2e/viewer_selectors.py`, also runnable alone)
- no uncaught page errors and no failed app requests

It writes `01-home.png`, `02-model.png`, `03-after-export.png`, `05-viewer-chrome.png`, `export.xlsx` and `report.json` to `E2E_OUTPUT_DIR`.

`smoke.py --multi` checks several models with the real viewer. It finds three different `.rvt` items through the API (by file name, no fixed ids) and opens each from the tree. For each it checks that a tab named after the file exists, the canvas matches its container within 4 px, the model is loaded, the URL holds its URN and the summary shows that model with its own rows. It then activates the first tab, drags the second tab to the right edge of the viewer group and checks both canvases follow their containers side by side, closes a tab and checks the others stay loaded, reopens it, reloads, and checks the tabs come back, the active model loads, hidden tabs fetch no manifest until activated, and no page errors. It writes `10-multi-*.png` to `13-multi-reloaded.png` and `multi-report.json`.

`smoke.py --combined` checks the combined viewer with the real viewer. It looks up `Snowdon Towers Sample Architectural.rvt` and `racbasicsampleproject.rvt` (by file name suffix, no fixed ids) plus `FILI_20170810_01.nwd` or `sgok_test.nwd`, keeps those whose manifest has an `svf` or `svf2` derivative, and opens them as one tab through `/model/<urn>?with=...`. Through the tagged viewer (`[data-bsh-viewer]`, property `bshViewer`, no `NOP_VIEWER`) it checks `getAllModels()` holds every model and each `isLoadDone()`, the visible scene bounds enclose every model box (it writes the distance between model centres and the units to the report and only warns when the models look unaligned), selecting a leaf of the last model shows up in `getAggregateSelection()`, the summary scope lists All models plus each model and every model has rows, removing one model from the Models menu leaves the others loaded and the canvas follows its container. It then opens two good models with `rmebasicsampleproject.rvt` (translated without geometry) and checks that member reports "No viewable geometry" (or a document load error when it has no manifest at all) while the others stay loaded, and that no page error occurred. It writes `combined-01-loaded.png`, `combined-02-bad-member.png` and `combined-report.json`.
`smoke.py --states` checks view states against the real account without fixed names. It discovers up to 40 items through the API (Test projects first), reads each version's `viewState` from the versions API, expands one file per state in the tree and asserts every version row's `data-view-state` equals the API value. For a version that is not ready or unknown it asserts that selecting opens no tab and the notice appears; for a ready one it asserts the model opens. It reports the state counts and does not fail when the account has none of a state. Set `E2E_STATE_EXPECT="name=state,..."` (file name suffix, for example `rmebasicsampleproject.rvt=no-geometry`) to also assert the latest version state of named files. It writes `states-report.json`.

`smoke.py --layout` opens the same model and checks only the dock layout with the real Autodesk viewer: the viewer element is tagged, then moved through its pane menu (Move right, Float, Dock, Move below, Move left) and the layout is reset from the top bar Panes menu. After each step the render canvas must match its container within 4 px, the tagged viewer element must still be the same one, and `NOP_VIEWER.model` must still be loaded. It writes `06-layout-*.png`, `07-layout-reset.png` and `layout-report.json`.

**mock_smoke.py** (run `e2e/.venv/bin/python e2e/mock_smoke.py`). Needs no sign-in. Start `npm run dev:mock` first (with `NODE_ENV=development` when `.env` sets production). It runs headless in a fresh, non-persistent session, launched with `os=HOST_OS` and `main_world_eval=True`, and checks:

- the session and health endpoints report the mock user and mock mode
- the app shows the signed-in user
- the tree expands hub by hub to a viewable version, selecting rows by `role=treeitem` and `aria-level`
- clicking the version opens the model route
- the document title names the model, the viewer tab shows the file name and version with the path and URN as its tooltip, the viewer pane has no header and the canvas fills its panel
- the mock viewer is present
- the `View States` folder shows the right badge and `data-view-state` for each state, selecting or pressing Enter on a version that is not ready opens no tab and shows the explanation, and the processing badge has a spinner, and all badges share the right edge without clipping on desktop, in the toggled theme and in the narrow layout
- the summary has rows and counts never wrap
- the export control, found by its accessible name or title (`/Export/i`) in the viewer toolbar, downloads a non-empty xlsx
- the theme toggle flips `document.documentElement.dataset.theme` in both directions and the choice survives a reload
- the dock shows the default layout (tree left, summary right, dashboard below the viewer)
- the pane menu moves the dashboard to the right edge, floats the viewer and docks it again, and the mock viewer element (tagged with a data attribute) is never replaced
- the layout is saved under `bsh.layout.v2` with `version: 2` and survives a reload
- a real pointer drag of the Dashboard tab onto the left of the viewer docks it there (if the drag ever stops working, the check falls back to `window.__bshLayout.movePane` through `mw:` and records a note)
- the keyboard path: Enter opens the pane menu, arrows pick Move below, focus lands on the moved tab, and `F6` moves focus to another pane; both live regions are present
- Reset layout in the top bar Panes menu restores the default arrangement
- at 800 px the stacked layout replaces the dock, the tree opens as an overlay and Escape closes it; back at 1440 px the saved dock arrangement returns and the viewer is still the same element
- Documents first: the start is Documents alone with the hint, Documents is the main landmark and has no close button or Close item; at the end, closing the summary from its tab and reopening it from the Panes menu, and closing the last model tab leaves Documents alone with the URL back at `/`
- several models: opening a second version adds a second tab and the URL follows, clicking an open version adds no duplicate, the summary follows the active tab and comes back unchanged, a pointer drag of a tab splits two models side by side with both scenes fitted, closing a tab keeps the other rendering, a reload restores the tabs and loads only the visible model, and at 800 px the model switcher activates the other model
- combined viewer: Ctrl or Cmd click and Space pick two versions (`aria-checked`) without opening them, Open together makes one `2 models` tab with one viewer and both models, the tooltip lists the files and the URL carries `with=`, the summary scope lists All models and each model and one model narrows the counts, paint covers a selection spread over both models, the export has a Model column, the Models menu hides a model, a reload restores the tab, a member whose urn contains `nogeom` explains "No viewable geometry" while the others render, removing members updates the URL and ends in a single-model tab, a row's Add to the open viewer button adds a version, and with six models the menu's Add model... is disabled with the limit
- collapsing the summary from its pane header widens the viewer and expanding restores the width exactly
- the viewer resizes after the document tree pane closes
- no horizontal overflow at 1440x900 and 390x844
- no uncaught page errors

It writes screenshots, `export.xlsx` and `mock-report.json` to `E2E_OUTPUT_DIR`.

### How counts are checked

"Summary counts never wrap" inspects the text of the last cell in each table row, not the cell box, because a count cell grows with a two-line neighbor. A cell fails when its text spans more than one line (text rectangles whose tops differ by more than 4 px) or when its content is wider than the cell.

### Known noise

The checks ignore failed requests to `cdn.derivative.autodesk.com` (404 for optional derivative assets) and the favicon. Everything else counts, including the page error `too many uniforms` (see below). Console errors are recorded in the report but do not fail a run.

### Fingerprint OS

`smoke.py` and `signin.py` launch Camoufox with `os=HOST_OS`, the operating system the script runs on. Without it Camoufox picks a random OS per launch and spoofs the user agent and WebGL limits to match. A Windows fingerprint on a Mac makes the viewer take its transform feedback path, which it disables for Firefox on macOS, and report 4096 vertex uniform vectors instead of the real 1024. The shader link then fails with `too many uniforms`, the exception escapes the viewer's main loop and the loop stops for good. The model stays on screen but never redraws or resizes, so the canvas no longer follows the layout.

### Session lifetime and the profile

The session cookie (`bim-hub-session`, `cookie-session`) is set with `maxAge` of one hour (`src/server/index.ts`). It does not roll: the cookie is only sent again when the session content changes, which happens at sign-in and when the server refreshes the Autodesk access token (when it is within 60 seconds of expiry, see `sessionTokens.ts`). Each such write sets a new one-hour cookie. Plain page loads and API calls do not extend it, and a failed refresh clears the session. So an idle profile is signed out about an hour after the last sign-in or token refresh, and `smoke.py` then exits 2. Run `npm run e2e:signin` again.

`e2e/.profile` contains cookies that are equivalent to your Autodesk login for the app. It is gitignored along with `e2e/.venv` and `e2e/output`. Never commit, copy or share it. Do not point `E2E_PROFILE_DIR` at a folder inside a synced or shared location.

A Firefox profile can be open in only one process. When more than one person or agent shares a profile, take a lock before running `smoke.py` or `signin.py`:

```bash
mkdir "$E2E_PROFILE_DIR.lock"
```

`mkdir` is atomic. If it fails, another run holds the lock: wait 20 seconds and retry for up to 10 minutes. Remove the lock with `rmdir "$E2E_PROFILE_DIR.lock"` when the run ends, including after a failure.
