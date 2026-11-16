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

## Vitest

`vitest.config.ts` defines two projects. `server` runs `src/server/**/*.test.ts` and `src/shared/**/*.test.ts` in Node. `web` runs `src/web/**/*.test.{ts,tsx}` in jsdom with Testing Library. Server routes are tested with supertest. The viewer adapter contract is tested against the mock adapter.

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

Mock mode needs `MOCK_APS=1` and a non-production `NODE_ENV`. The server computes `mock = !production && MOCK_APS === '1'`, so a production process with `MOCK_APS=1` still uses real APS. The client mock viewer additionally requires `import.meta.env.DEV`, so it is not reachable from a production build. In mock mode every request is signed in as "Alex Rivera" and no Autodesk call is made.

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
- the breadcrumb is shown
- the Autodesk viewer mounts and its toolbar is present
- the summary has rows
- summary counts never wrap
- the page has no horizontal overflow
- the Excel export downloads an xlsx
- the native viewer chrome is themed (control group uses the graphite token with no shadow, button hover is not Autodesk cyan, tooltips are not capitalized, docking panels use Inter) and every selector in `viewerChrome.css` still exists in the Autodesk stylesheet (`e2e/viewer_selectors.py`, also runnable alone)
- no uncaught page errors and no failed app requests

It writes `01-home.png`, `02-model.png`, `03-after-export.png`, `05-viewer-chrome.png`, `export.xlsx` and `report.json` to `E2E_OUTPUT_DIR`.

**mock_smoke.py** (run `e2e/.venv/bin/python e2e/mock_smoke.py`). Needs no sign-in. Start `npm run dev:mock` first. It runs headless in a fresh, non-persistent session and checks:

- the session and health endpoints report the mock user and mock mode
- the app shows the signed-in user
- the tree expands hub by hub to a viewable version, selecting rows by `role=treeitem` and `aria-level`
- clicking the version opens the model route
- the title and breadcrumb are correct
- the mock viewer is present
- the summary has rows and counts never wrap
- the export control, found by its accessible name or title (`/Export/i`) in the viewer toolbar, downloads a non-empty xlsx
- the theme toggle flips `document.documentElement.dataset.theme` in both directions and the choice survives a reload
- the summary rail collapses and expands, and the viewer width grows and is restored
- the viewer resizes after the document tree collapses
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
