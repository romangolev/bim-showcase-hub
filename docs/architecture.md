# Architecture

A React single-page client and a small Express server. The server holds the Autodesk credentials and tokens. The client talks only to `/api`.

## Server

`src/server/index.ts` exports `createApp(config, deps)`. Two entry points use it: running the file directly (dev and `npm start`) listens on `PORT`, and `api/index.ts` exports the app for the Vercel function.

The app has:

- A signed `cookie-session` named `bim-hub-session`: `httpOnly`, `sameSite=lax`, secure on HTTPS.
- `apiRouter` at `/api`: `health`, `csp`, `auth` and `data` routers. Unknown `/api` paths return 404 JSON.
- In production, static files from `dist/web` (or `STATIC_DIR`) with an `index.html` fallback.
- `errorHandler`, which returns `{ error }`. Unexpected errors become a generic 500.

`src/server/config.ts` (`loadConfig`) reads the environment, see [development.md](development.md#environment-variables). In production it throws when `SESSION_SECRET`, `APS_CLIENT_ID` or `APS_CLIENT_SECRET` is missing, or when the secret is `change-me`. Scopes are `data:read` and `viewables:read`.

### Routes

| Route | Purpose |
|---|---|
| `GET /api/health` | `{ status: "ok", mock }` |
| `GET /api/session` | Signed-in user, `appClientId` (public), `expiresAt`, or 401 |
| `GET /api/auth/url` | Autodesk authorization URL |
| `GET /api/auth/callback` | OAuth redirect target |
| `POST /api/auth/signout` | Clears the session, revokes the refresh token (best effort), 204 |
| `GET /api/viewer/token` | Short-lived access token for the viewer |
| `GET /api/hubs` | Hubs, each with `hubType` (`personal`, `team`, `account`, `unknown`) |
| `GET /api/hubs/:hubId/projects` | Projects in a hub |
| `GET /api/hubs/:hubId/projects/:projectId/folders` | Top folders of a project |
| `GET /api/projects/:projectId/folders/:folderId/contents` | Folders and items |
| `GET /api/projects/:projectId/items/:itemId/versions` | Versions of an item |
| `GET /api/projects/:projectId/items/:itemId/versions/:versionId/view-state` | View state of one version |
| `POST /api/csp-report` | CSP violation reports, see [deployment.md](deployment.md#csp-reports) |

Upstream errors pass through `toHttpError`: 404 stays 404, 401 and 403 become 401, the rest become 502.

### Auth flow

1. `/api/auth/url` stores a random `state` in the session and returns the Autodesk authorize URL.
2. Autodesk redirects to `APS_CALLBACK_URL`.
3. The callback checks `state`. A failure redirects to `/?auth_error=<code>`: `invalid_state`, `access_denied`, `missing_code` or `upstream_error`.
4. The server exchanges the code and stores the sealed tokens and the user (`{ id, name, picture }`) in the cookie. `id` is a SHA-256 hash of the Autodesk `sub`.
5. Data routes call `getAccessToken`, which refreshes the token when under 60 seconds remain. Autodesk refresh tokens are single-use, so the result of a rotation is also kept in the process for two minutes under the token it replaced. A request that still carries the cookie from before the rotation gets those tokens instead of presenting a spent refresh token.

A refresh that Autodesk rejects answers 401. The cookie is cleared only on the client's one retry (`X-Auth-Retry: 1`), so parallel requests cannot sign each other out.

### Sessions

There is no server-side store. The session is a signed cookie.

- Tokens live in `session.aps` as one AES-256-GCM sealed string. The key comes from `SESSION_SECRET` (HKDF). Code: `src/server/auth/sessionTokens.ts`.
- A session ends 12 hours after the last token refresh and 7 days after sign-in at the latest.
- The window moves only when a request needs a refresh, in the same write that stores the rotated refresh token.
- The cookie must stay under 3800 bytes. A refresh that does not fit drops the user's picture first, then ends the session with 401. A sign-in that does not fit fails with `upstream_error`.
- Sign-out revokes the refresh token. Its access token still works until it expires, about an hour.
- `/api/viewer/token` returns the session's access token, because the viewer needs one in the browser.

### Data mapping and ids

`apsDataService.ts` wraps `@aps_sdk/data-management`. `mapping.ts` turns resources into one shape, `TreeNode` (`src/shared/types.ts`): `id`, `kind` (`hub`, `project`, `folder`, `item`, `version`), `name`, `hasChildren`, `viewState`, optional `urn`, `parentId`, `modifiedAt`, `modifiedBy`, `size`.

Autodesk ids contain characters such as `:` and `/`. `ids.ts` encodes every id as base64url before it leaves the server and decodes it on the way in. Anything that does not round-trip is rejected with 400 "Invalid id".

### View state

A derivative URN does not prove a model opens: the manifest can hold only a thumbnail. `data/viewState.ts` reads the Model Derivative manifest with the user's token and sets `TreeNode.viewState`:

| State | Meaning | Opens |
|---|---|---|
| `ready` | An `svf` or `svf2` derivative succeeded | yes |
| `processing` | Translation pending or running | no |
| `failed` | Translation failed or timed out | no |
| `no-geometry` | Manifest succeeded without `svf` or `svf2` | no |
| `not-translated` | No manifest, or no derivative URN | no |
| `unknown` | The check could not run, or the version was not checked | yes |

- Listing versions checks only the newest `CHECKED_VERSIONS` (5) within `LIST_BUDGET_MS` (6 s). A failed check yields `unknown`.
- The `view-state` route checks one version on demand. Documents calls it before opening an unchecked version.
- Results are cached per access token and URN for 10 to 60 seconds. The region comes from the URN (`src/shared/region.ts`).

## Client

`src/web/main.tsx` renders `App` with a TanStack Query client and Router.

- **Router** (`routes/router.tsx`): `/` shows the empty state, `/model/$urn` opens a model through `ModelRouteSync`. Search parameters are parsed by `parseModelContext`.
- **Query** (`src/web/api/hooks.ts`): the `['session']` query picks the landing page or the app. Tree children are queries keyed by `scopeKey`.
- **Tree** (`components/tree/DocumentTree.tsx`): `@headless-tree/core` with `@tanstack/react-virtual`. Only versions in state `ready` or `unknown` open a model. Others show an explanation and a Check again button. The tree state is `components/tree/treeState.ts`, with no React in it: the node registry, loading and polling, the view-state check, picking and the open decisions (view state, tab limit). It takes a `TreeData` seam (children, forget, view state) and a `TreeHost` bound by the component; `treeData.ts` wraps react-query and the APS client, tests use an in-memory fake. It decides and `DocumentTree` performs the open through its props. `useTreeState` reads it with `useSyncExternalStore`, one instance per mount.
- **Layout** (`src/web/layout`): `AppShell` loads `LayoutProvider` when signed in. Panes come from `paneRegistry.ts`. Named workspaces live in one personal record (`bsh.workspaces.v1`): each item is a `LayoutModel` plus a pane appearance map. `paneLifecycle.applyWorkspace` snapshots the previous layout for the one-step Revert and leaves the open-models store alone, so the dock rebuilds around the same viewers. `layoutApply.ts` is the one place that applies a preset, saved, imported or shared layout, with Revert and the active label. `layoutShare.ts` encodes the same payload for `#layout=`. Details in [layout.md](layout.md).
- **Viewer** (`src/web/viewer`): `ViewerPane` creates one `ViewerAdapter` per model tab and publishes it through context. `useViewer()` returns the active tab's adapter.

### Open models

`src/web/api/openModels.ts` is the open-models store: open URNs with their context, the active URN and the loaded ones. It lives in `sessionStorage`, so a reload restores the tabs.

- A model loads when its tab is first shown.
- Loaded tabs share a budget of `MAX_LOADED_MEMBERS` (8, `src/shared/combined.ts`). Over it, the least recently shown background tabs are paused and offer a Load button.
- A combined tab holds up to `MAX_COMBINED_MODELS` (6) models in one scene.
- `ModelRouteSync` keeps the URL and the store in step.

Share links (`api/viewLink.ts`) carry the camera and selection (version 1), the pane and chart state (version 2) and per-model hidden and isolated node ids (version 3). `viewer/shareLink.ts` captures them from `adapter.getState()`; `viewer/incomingLink.ts` restores an opened link (read from the router search, applied once, cleared through the router) and calls `restoreState` after the models load. Nothing is stored on the server.

### Persisted records

`src/web/storage.ts` is the only code that touches browser storage.

- `defineRecord({ key, initial, sanitize, area?, codec? })` returns a record with `read`, `write`, `remove`. Reads are always sanitized.
- `usePersisted(record)` is the React hook: `[value, update, reset]`. It re-reads when the record's key changes, so one component can serve several panels.
- `defineRecordFamily` makes one record per argument. Its prefix must be in `BSH_PERSONAL_PREFIXES`, and `get` and `forget` throw for a key outside that prefix.
- `BSH_KEYS` lists the fixed keys as `personal` (cleared on sign-out) or `preference` (kept). Keys under `BSH_PERSONAL_PREFIXES` are personal too, so a new `bsh.pane.*` key is forgotten even when it is not in the list.
- `forgetPersonal()` runs on sign-out and when the owner changes.
- Tests swap in `memoryAdapter()` with `setStorageAdapter`.

The keys are listed in [development.md](development.md#storage-keys).

### User-made items

`src/web/store/savedStore.ts` holds viewpoints, selection sets, dashboard presets and export presets in one personal record (`bsh.saved.v1`). Each kind is declared once with `defineSavedKind` (`store/savedKinds.ts`), which registers it through `registerSavedKind` (`store/savedKindRegistry.ts`) and returns a typed handle. The production kinds are `viewpoint` (`viewer/viewpoints.ts`), `selection-set` (`viewer/selectionSets.ts`), `dashboard-preset` (`extensions/dashboardPresets.ts`) and `export-preset` (`tools/excel/exportPresets.ts`), all at version 1. The export envelope is `bsh-saved` version 2 with a per-kind version map; import merges by id.

A selection set stores dbIds per model plus optional stable external ids (`keys`). `viewer/setResolution.ts` owns resolving a set: `resolveSet` and `scopeElementItems` map keys back through `adapter.getExternalIdMap` (cached per model version) and never write, with `undefined` meaning the set is gone. Only `selectSet` and `migrateSelectionSet(s)` persist the move of dbIds into keys. `mergeSetData` keeps the union or the intersection by identity (model plus key or dbId).

### Scoped rows

Summary, Dashboard and exports read property rows the same way: `useScopedRows` in panels and `readScopedRows` (`viewer/scopedRows.ts`) in async code. The seam owns model resolution, element scope, the failure report and the scope note. `readScopedRows` returns partial rows with `failed` naming the models it could not read, so callers check it. `peekScopedRows` is the count-path probe: it takes no property names, returns `null` on a cold cache, and returns the columns that were already cached. The hook keeps its own live element scope — it reads with `elements: 'all'` and applies selection and visibility changes without restarting the read — so the status does not flicker.

- Dashboard and Excel choose their columns from the shared property catalog: `PropertyPicker` (`panels/PropertyPicker.tsx`) lists what `usePropertyCatalog` discovered, and the chosen names become the `names` of the scoped read. A dashboard view carries its own list in `properties`: the main Dashboard in `bsh.dashboard.view.v1`, each chart instance in `bsh.pane.chart.<n>.v1`, so two charts can chart different properties. Excel keeps its columns in its tool settings (`bsh.tool.excel.v1`). A view saved before this field existed falls back to the old shared list in `bsh.pane.dashboard.properties.v1`; `migrateDashboardProperties` (called from `main.tsx`) writes that list into the stored views once. The export drops columns from the same rows rather than reading the model again.
- Scope is a model (`ALL_MODELS` or one model id) plus elements (`all`, `selected`, `visible`, `isolated` or `set:<id>`).
- `viewer/sharedLeafRows.ts` keeps one cache per adapter and model. Refresh clears it. An empty read is cached only when the adapter reported a complete tree (`onProgress` with `total: 0`), so a transient empty read is read again; `peekLeafRows` then returns `[]`.
- The hook returns status, progress, `reload` and `cancel`.
- The `selected` scope refreshes live (the selection event, debounced; the latest result wins). `visible` and `isolated` refresh on the adapter's visibility event (debounced). `set:<id>` is read once per read or reload; use Refresh after editing a set.

## ViewerAdapter

`viewer/ViewerAdapter.ts` is the only way panels and tools reach a viewer. It covers:

Groups of methods: lifecycle (`load`, `resize`, `destroy`, `setTheme`), model sets (`loadModels`, `addModel`, `removeModel`, `getModels`), properties (`getLeafProperties`, `discoverProperties`), selection and actions (`getModelSelection`, `selectModelIds`, `isolateModelIds`, `fitToView`), state (`getState`, `restoreState`, `getScreenshot`), paint, `registerToolGroup` and export sources (`getGeometryParts`, `getIfcSource`).

`restoreState` resolves with a `RestoreReport` (`skippedModels` whose object tree could not be read, and `viewerFailed` when the viewer's own restore threw). `goToViewpoint` turns a non-empty report into a `partial` result with a notice instead of `ok`. Isolation with only the hide-all sentinel (`HIDE_ALL_NODE`, -1) means nothing is visible for that model; `getVisible` ignores the sentinel. Object tree reads share one guarded `readTree` (`viewer/viewerState.ts`) that rejects after `TREE_TIMEOUT_MS`.

`createViewerAdapter` picks the implementation. The mock adapter is used only when `import.meta.env.DEV` is true and `VITE_MOCK_APS=1`, so production builds hold no mock viewer.

- **RealViewerAdapter** loads the Autodesk Viewer 7.* script, initializes it once per page with a token callback that calls `/api/viewer/token`, and starts a `GuiViewer3D`. The page supports one region: the `derivativeV2_EU` API is chosen when the URN contains `emea`.
- **MockViewerAdapter** draws a fixture building as SVG with generated property rows. A URN containing `broken`, `nogeom`, `noprops` or `far` simulates a failed load, no geometry, a failed property read and a far-away model.
- `adapter.contract.test.ts` runs the same contract against both adapters.

### Model sets

One adapter holds several models in one scene (`viewer/modelSet.ts`). `load(urn)` is `loadModels([{ urn }])`.

- Each model loads on its own. A failure sets `status: 'error'` and leaves the others alone.
- Selection is a list of `{ modelId, dbId }` pairs, because dbIds repeat across models.
- Models align by shared coordinates. The first loaded model is the anchor.
- `getLeafProperties` skips hidden models. A model whose properties fail gets `propertiesError`.

### Toolbar group

The real adapter mounts tools as the Autodesk extension `BimShowcaseHub.Tools` (`viewer/autodeskTools.ts`). The mock adapter shares `viewer/toolGroupController.ts`.

### Resize, full screen and theme

Each adapter has one resize scheduler (`viewer/resizeScheduler.ts`) that merges requests from the host `ResizeObserver`, the window and full-screen events. Moving a pane moves its host element, so the adapter and canvas are never recreated. `ViewerPane` also calls `adapter.setTheme` on creation and on every theme change.

## Extension points

Tools, commands, settings and panes are described in [extensions.md](extensions.md). The app shell depends on the tool registry, never on a concrete tool.
