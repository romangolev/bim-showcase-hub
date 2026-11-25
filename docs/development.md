# Development

## Requirements

- Node 24 and npm.
- For end-to-end tests only: [uv](https://docs.astral.sh/uv/) and Python 3.12.

## Setup

```bash
npm install
npm run dev:mock
```

`npm run dev` starts the Express server (`tsx watch`, port `PORT`, default 3000) and Vite (port 5173). Vite proxies `/api` to the server. Open http://localhost:5173.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Server and Vite with real APS credentials |
| `npm run dev:mock` | Same, with `MOCK_APS=1` and `VITE_MOCK_APS=1` |
| `npm run build` | Type-check the web app, build to `dist/web`, compile the server to `dist/server` |
| `npm start` | `node dist/server/index.js` |
| `npm run lint` | `biome check .` |
| `npm run format` | `biome check --write .` |
| `npm run typecheck` | `tsc` for the server and web configs |
| `npm test` | `vitest run` |
| `npm run e2e:*` | End-to-end scripts, see below |

Biome formats and lints (two-space indent, single quotes) and ignores `docs`. Run `npm run lint` before committing. Its CSS parser has `tailwindDirectives` on, so it reads `@theme` and `@source` in `src/web/styles/tailwind.css`.

## Environment variables

Copy `.env.example` to `.env`. `.env` is gitignored.

| Variable | Default | Notes |
|---|---|---|
| `APS_CLIENT_ID` | empty | Required in production |
| `APS_CLIENT_SECRET` | empty | Required in production. Never commit it |
| `APS_CALLBACK_URL` | `http://localhost:3000/api/auth/callback` | Must match the APS app exactly |
| `SESSION_SECRET` | random per start in development | Required in production. `change-me` is rejected |
| `MOCK_APS` | `0` | `1` enables mock data. Ignored in production |
| `MOCK_EMPTY_HUBS` | unset | With mock mode: empty hub list, shows the no-hubs hint |
| `MOCK_PERSONAL_ONLY` | unset | With mock mode: one personal hub, shows the dismissible notice |
| `VITE_MOCK_APS` | unset | `1` enables the mock viewer in the Vite dev server only |
| `PORT` | `3000` | Server port. Vite reads it to find the server |
| `NODE_ENV` | `development` | `production` turns on secure cookies, static serving and strict checks |
| `STATIC_DIR` | `dist/web` | Production only |

With real credentials, run the server on port 3000 and register `http://localhost:3000/api/auth/callback` in the APS app.

Mock mode needs `MOCK_APS=1` and a non-production `NODE_ENV`. The mock viewer also needs `import.meta.env.DEV`, so a production build cannot reach it.

## Tests

`vitest.config.ts` has two projects:

- `server`: `src/server/**` and `src/shared/**` tests in Node. Routes use supertest.
- `web`: `src/web/**` tests in jsdom with Testing Library.

Helpers:

- `src/web/test/render.tsx` wraps a tree in `ThemeProvider`. Use it for anything that calls `useTheme`.
- `setStorageAdapter(memoryAdapter())` swaps storage for tests. `installMemoryStorage()` in `src/web/test/mockApi.ts` gives component tests a working `localStorage`.
- `createPaneLifecycle` runs with fakes, without dockview.

## Storage keys

All browser storage goes through `src/web/storage.ts`. `BSH_KEYS` lists the fixed keys and `BSH_PERSONAL_PREFIXES` the personal families (`bsh.pane.`, `bsh.paint.`). Personal keys are cleared on sign-out. Preference keys stay.

| Key | Class | Holds |
|---|---|---|
| `bsh.layout.v2` | personal | Dock arrangement (see [layout.md](layout.md#persistence)) |
| `bsh.layout.instances.v1` | personal | Added pane instances |
| `bsh.models.open` | personal | Open model tabs (`sessionStorage`): the URN and context of each tab, the active one, and per-tab offsets, spread, view state, `remember: false` and `pinned: true` |
| `bsh.models.session.v1` | personal | Tabs from the last visit (`localStorage`) without view state. Read at start when "Reopen my tabs after the browser restarts" is on; removed when the switch turns off or on sign-out |
| `bsh.models.owner`, `bsh.models.recent`, `bsh.models.hidden` | personal | Owner id, recent models, hidden models |
| `bsh.models.tints.v1` | personal | Per-model tint colour and strength, the global tint palette, a palette per model set, and ghost others |
| `bsh.models.views.v1` | personal | Per-document view preferences: the start view, favorite view ids and hidden view ids. Holds up to 200 documents; the least recently changed is dropped |
| `bsh.docs.pinned` | personal | Pinned model URNs |
| `bsh.summary.*`, `bsh.dashboard.*` | personal | View, properties, scope and click action of the main panes. The dashboard view includes its property list |
| `bsh.pane.<kind>.<n>.v1` | personal | Spec of a chart, summary or properties pane instance. A chart spec includes its property list |
| `bsh.pane.docs.root.v1` | personal | Documents root: the hub and project the tree starts at |
| `bsh.pane.appearance.v1` | personal | Pane titles and colour tags, keyed by panel id (`summary`, `chart:1`). Under the `bsh.pane.` prefix |
| `bsh.pane.colors.v1` | personal | Colors pane: mode, property or rules, top N, overrides and the working rule set |
| `bsh.pane.search.v1` | personal | Search elements pane: the last text and the attribute names it searches. Under the `bsh.pane.` prefix |
| `bsh.hint.onboarding.v1` | personal | Onboarding hints dismissed |
| `bsh.topbar.v1` | preference | Top bar: whether the model breadcrumb shows the full path, the file name only or nothing |
| `bsh.saved.v1` | personal | Saved items: dashboard presets, export presets, summary presets, report templates, colour rules, selection sets, viewpoints, combinations, model sets, document searches |
| `bsh.workspaces.v1` | personal | Named workspaces: `{ version: 1, items }`, each with a name, a layout and pane appearances |
| `bsh.commands.recent.v1` | personal | Recent palette commands |
| `bsh.paint.<hash>` | personal | One paint record per model version: an ordered, bounded list of paint actions and the undo cursor. The hash covers the URN and the model version |
| `bsh.hint.hubs.dismissed.v1` | personal | No-hubs notice dismissed |
| `bsh-settings-v1` | preference | App settings, version 4: theme (`system`, `light`, `dark`), density, text size (100, 112, 125), reduced motion, reopen last session, language (`en`, `ru`), units (`metric`, `imperial`), session warning, recents length |
| `bsh.layout.locked` | preference | Layout lock |
| `bsh.tree.view` | preference | Tree sort and metadata columns, the open mode, what a click on a file does (`itemOpen`: expand, latest, last opened), whether thumbnails load and whether rows are a list or thumbnails (`thumbnails`, `rows`), whether a filter search covers the loaded folders or the whole project (`searchScope`), and which Home sections show |
| `bsh.snapshot.v1` | preference | Snapshot and Present options |
| `bsh.notify.v1` | preference | Toast position, duration and quiet mode |
| `bsh.charts.v1` | preference | Chart palette, pattern fills and whether the data table starts open |
| `bsh.share.v1` | preference | Which parts a Share link carries (selection, panes and charts, hidden and isolated). The camera is always included |
| `bsh.commands.pinned.v1` | preference | Pinned palette commands |
| `bsh.commands.viewer.keys.v1` | preference | Rebound viewer shortcuts, keyed by command id. Commands missing here use the defaults |
| `bsh.tool.<id>.v1` | preference | Per-tool settings (`paint`, `excel`, `glb`, `ifc`, `toolbar`, `display`). Excel stores its chosen columns in `properties`, the column format per property in `columnFormats`, the colour toggles, the group-by, the empty label and the confirmation threshold; paint stores the palette, restore-on-open and history depth; toolbar stores the profile and its custom hidden-control list; display stores the light preset and the rendering toggles |

To reset the layout, run `localStorage.removeItem('bsh.layout.v2')` or use Reset layout in the Panes menu or Settings > General > Defaults. In mock mode `window.__bshLayout` exposes the layout API for tests and `window.__bshMeasureRows()` returns the current adapter's cached leaf rows for `e2e/measure_rows.py`. Neither exists in production builds.

## CSP

`Content-Security-Policy-Report-Only` is set in `vercel.json` and by the production Express path (`src/server/csp.ts`). A test keeps the two equal. It is report-only because it has not been checked against every Viewer case. To enforce it:

1. Run the real app and check the browser console and the `csp-report` log lines ([deployment.md](deployment.md#csp-reports)).
2. Adjust the policy in both places.
3. Rename the header to `Content-Security-Policy`.

## End-to-end tests

Camoufox, a Firefox build driven through the Playwright Python API, is the only browser for end-to-end tests and visual QA. Do not use Playwright MCP or Chromium. Scripts run headless by default.

```bash
npm run e2e:setup
```

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:5173` | App under test |
| `E2E_PROFILE_DIR` | `e2e/.profile` | Persistent profile for `signin.py` and `smoke.py` |
| `E2E_OUTPUT_DIR` | `e2e/output` | Screenshots, downloads and JSON reports |
| `E2E_HEADLESS` | `1` | `0` shows the window. `signin.py` is always headed |
| `E2E_REVIT_URN` | built-in sample | Model for the `glb`, `ifc` and `state` scripts |

Exit codes: 0 all passed, 1 a check failed or the app was unreachable, 2 not signed in (`smoke.py` only).

Shared helpers live in `e2e/common.py`. To read page globals, launch with `main_world_eval=True` and prefix the expression with `mw:`.

### Scripts

| Script | Needs | What it checks |
|---|---|---|
| `e2e/mock_smoke.py` | `npm run dev:mock`, no sign-in | The whole app in mock mode: tree, viewer, exports, layout, themes, panes, Task Center |
| `e2e/a11y_audit.py` | `npm run dev:mock`, no sign-in | Accessible names, clipped text, 200% zoom, 125% text, forced colors, keyboard pane moves and 44px touch targets |
| `e2e/visual_shots.py` | `npm run dev:mock`, no sign-in | Screenshots of a fixed list of screens (documents, model, menus, command palette, Share, Task Center, every settings section) at 1440x900 and 390x844 in both themes into `e2e/output/shots/<label>/`. `visual_shots.py --diff <before> <after>` prints the changed-pixel percentage per image. The baseline is a run on `dev`, nothing is stored in git |
| `e2e/a11y_names.py` | `npm run dev:mock`, no sign-in | The ARIA snapshot (role and accessible name) of the same screens into `e2e/output/names/<label>.txt`; `diff` two labels to prove a UI change kept roles and names |
| `e2e/bundle_size.py` | `npm run build` | Raw and gzip size of the built JS and CSS against the budget, and the cascade layer order of the production stylesheet; exits non-zero on a failure |
| `e2e/ux_audit.py` (`e2e:ux`) | `npm run dev:mock`, no sign-in | Contrast, 3:1 field edges, focus rings, touch targets (44px stacked, 32px desktop, 24px for compact row actions), clipping and overflow for every settings window, menu, pane and loading, empty and error state, in both themes at 320, 768 and 1440, plus forced colours, where only focus presence and targets are checked because the colours are the system's; exits non-zero on any failure |
| `signin.py` (`e2e:signin`) | A visible window | You sign in to Autodesk by hand. It polls `/api/session` for up to 15 minutes |
| `smoke.py` (`e2e:smoke`) | A signed-in profile | The real app: session, tree, viewer, summary, Excel export, native viewer styling |
| `glb_revit.py` (`e2e:glb`) | `.env` credentials | GLB export on a real Revit model |
| `ifc_revit.py` (`e2e:ifc`) | `.env` credentials | IFC export, validated with IfcOpenShell |
| `state_revit.py` (`e2e:state`) | `.env` credentials | Viewer state capture and restore |

Notes:

- `mock_smoke.py`: start `NODE_ENV=development npm run dev:mock`, then run `e2e/.venv/bin/python e2e/mock_smoke.py`. `E2E_MOCK_VARIANT=empty` or `personal` checks the hub hint against a server started with `MOCK_EMPTY_HUBS=1` or `MOCK_PERSONAL_ONLY=1`.
- `a11y_audit.py` runs every flow at desktop 1440x900, 200% zoom (640x400), 125% text (1280x800) and the stacked layout at 390x844, then with `language: 'ru'`, and writes `a11y_report.json` through `checks.finish`. `--lang ru` switches the zoom and text-size flows to Russian and adds one Cyrillic case: it opens `Рабочая документация` in the mock tree, checks that `document.fonts.check('14px "Inter Variable"', 'Жилой')` is true, that the row's computed font family starts with `Inter Variable`, that the long name keeps its full text in a `title`, and that nothing is clipped. Forced colors come from `browser.new_context(forced_colors='active')`: the `ui.forcedColors` pref is inert in this Camoufox build, so the script reads `matchMedia('(forced-colors: active)')` and skips with a note when the build cannot emulate it. The Autodesk canvas and its own controls are outside the name and clipping checks.
- `mock_smoke.py` also covers Documents and versions: the one Latest badge on a file, a selection set saved from Search elements and listed on Home, a saved model set that opens two tabs and copies a `with=` link, thumbnail rows with the placeholder for a file without a thumbnail, and a deep search that finds a file in an unexpanded folder and can be cancelled.
- `smoke.py` accepts browser dialogs, because large exports ask for confirmation. Extra modes: `--multi` (several models), `--combined` (one combined viewer), `--states` (view states against the account), `--layout` (dock moves with the real viewer). `E2E_STATE_EXPECT="file.rvt=no-geometry,..."` asserts the latest state of named files.
- `glb`, `ifc` and `state` use a two-legged token from `.env` and the harness in `e2e/harness/`. No sign-in. The default model is in the maintainer's APS bucket, so another APS app must set `E2E_REVIT_URN`.
- IfcOpenShell is in `e2e/requirements.txt` only. Never add it to `package.json`.
- Use Revit models for real-APS checks, and more than one model for anything about several models.

Scripts launch Camoufox with `os=HOST_OS`. A spoofed OS can make the viewer stop redrawing with a `too many uniforms` error.

### Sign-in profile

`signin.py` and `smoke.py` reuse a persistent profile at `E2E_PROFILE_DIR`.

- The profile holds cookies equal to your Autodesk login for the app. It is gitignored with `e2e/.venv` and `e2e/output`.
- Never read, copy, commit or share it. Do not put it in a synced folder.
- Run `signin.py` against the same `E2E_BASE_URL` you test, because cookies are per origin. Run it again when `smoke.py` exits 2.
- A profile can be open in one process only. When several runs share it, take a lock first:

```bash
mkdir "$E2E_PROFILE_DIR.lock"
```

`mkdir` is atomic. If it fails, another run holds the lock: wait 20 seconds and retry for up to 10 minutes. Run `rmdir "$E2E_PROFILE_DIR.lock"` when the run ends, including after a failure.
