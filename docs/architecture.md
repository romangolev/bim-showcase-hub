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
| `GET /api/thumbnails/:urn` | Model Derivative thumbnail as image bytes, `?size=100\|200\|400` ([Thumbnails](#thumbnails)) |
| `POST /api/csp-report` | CSP violation reports, see [deployment.md](deployment.md#csp-reports) |

Upstream errors pass through `toHttpError`: 404 stays 404, 401 stays 401, 403 stays 403 (no access, which the client shows as such and never treats as a sign-out), 429 stays 429 with `Retry-After` (5 seconds when upstream gives none, capped at 120), the rest become 502. A 429 is never retried inside the server; the caller waits.

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

`apsDataService.ts` wraps `@aps_sdk/data-management`. `mapping.ts` turns resources into one shape, `TreeNode` (`src/shared/types.ts`): `id`, `kind` (`hub`, `project`, `folder`, `item`, `version`), `name`, `hasChildren`, `viewState`, optional `urn`, `parentId`, `modifiedAt`, `modifiedBy`, `size`, `versionNumber`, `latest` and `tipUrn`.

- A version node carries its `versionNumber`; `markLatest` marks the highest number of one item with `latest` (`true` on exactly one version), and the client never infers the latest from list order.
- An item node carries the tip version's `versionNumber` and, when that tip has a derivative, its URN as `tipUrn`. This is what lets a file row show a thumbnail and filter by "has a viewable".

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

### Thumbnails

`GET /api/thumbnails/:urn?size=100|200|400` proxies Model Derivative "Fetch Thumbnail" (`data/thumbnails.ts`). `size` defaults to 200. The route decodes the URN, sends the user's access token and the URN's region header, and relays only `image/png` or `image/jpeg` bodies up to 512 KB as `Cache-Control: private, max-age=3600` with `X-Content-Type-Options: nosniff`. An invalid URN or size is 400, an upstream 401 or 403 is 401, an upstream 429 is 429 with `Retry-After`, and anything else upstream is 502.

A 404 means there is no thumbnail, usually because the version has not translated; the client shows a placeholder instead of retrying. Only rows the virtualizer renders mount an `img` with `loading="lazy"`, so a folder scrolls without a request per file. Mock mode serves an SVG per translated version, which is the one place `image/svg+xml` is allowed.

## Client

`src/web/main.tsx` renders `App` with a TanStack Query client and Router.

- **Router** (`routes/router.tsx`): `/` shows the empty state, `/model/$urn` opens a model through `ModelRouteSync`. Search parameters are parsed by `parseModelContext`.
- **Query** (`src/web/api/hooks.ts`): the `['session']` query picks the landing page or the app. Tree children are queries keyed by `scopeKey`.
- **Tree** (`components/tree/DocumentTree.tsx`): `@headless-tree/core` with `@tanstack/react-virtual`. Only versions in state `ready` or `unknown` open a model. Others show an explanation and a Check again button. The tree state is `components/tree/treeState.ts`, with no React in it: the node registry, loading and polling, the view-state check, picking and the open decisions (view state). It takes a `TreeData` seam (children, forget, view state) and a `TreeHost` bound by the component; `treeData.ts` wraps react-query and the APS client, tests use an in-memory fake. It decides and `DocumentTree` performs the open through its props. `useTreeState` reads it with `useSyncExternalStore`, one instance per mount.
- **Opening models** (`viewer/openModels.ts`): the one place that admits models. `openModels(store, { models, mode })` takes an intent (`tabs`, `together`, `add-to-active`, `replace`) and returns what opened, what was skipped and why, where to reveal, and one notice that names the cap that applied (8 loaded for tabs, 6 for a combined viewer). `previewOpen` shares its planner, so a disabled button and the real open agree. Tabs are all or nothing unless `partial` is set, which keeps what fits and reports the rest. The limits (`MAX_LOADED_MEMBERS`, `MAX_COMBINED_MODELS`) live in `shared/combined.ts`; callers do not check them.
  - **Deep search** (`crawl.ts`, `deepSearch.ts`) walks the folders of one project through the same contents route and adds every node to the registry, ancestors included. It is a bounded crawl, not the APS folder search endpoint: three folder reads at once, at most 400 folders, 10,000 nodes and 90 seconds. A 429 pauses every worker for `Retry-After` (at most 30 s), a 502, 503 or network error backs off from 1 s, other errors fail that folder without a retry, and a 401 stops the crawl. The filter and its chips then match files in folders that were never expanded. Matching folds case and accents, folders match only on text, versions never match, and any type chip, "Has a viewable" or date range narrows the result to items. "Has a viewable" tests `tipUrn`, which approximates a derivative existing rather than a manifest that is `ready`. The crawl covers the project root, or the only project that was loaded; without either, the pane says to pick a project in the switcher.
- **Layout** (`src/web/layout`): `AppShell` loads `LayoutProvider` when signed in. Panes come from `paneRegistry.ts`. Named workspaces live in one personal record (`bsh.workspaces.v1`): each item is a `LayoutModel` plus a pane appearance map. `paneLifecycle.applyWorkspace` snapshots the previous layout for the one-step Revert and leaves the open-models store alone, so the dock rebuilds around the same viewers. `layoutApply.ts` is the one place that applies a preset, saved, imported or shared layout, with Revert and the active label. `layoutShare.ts` encodes the same payload for `#layout=`. Details in [layout.md](layout.md).
- **Styling**: plain CSS over the tokens in `styles/tokens.css`, plus Tailwind v4 (`@tailwindcss/vite`, no Preflight) for the components in `src/web/ui`, which are shadcn/ui components on Base UI (`@base-ui/react`). Details in [design-system.md](design-system.md#tailwind-and-srcwebui).
- **Viewer** (`src/web/viewer`): `ViewerPane` creates one `ViewerAdapter` per model tab and publishes it through context. `useViewer()` returns the active tab's adapter.

### Open models

`src/web/api/openModels.ts` is the open-models store: open URNs with their context, the active URN and the loaded ones. It lives in `sessionStorage`, so a reload restores the tabs.

- A model loads when its tab is first shown.
- Loaded tabs share a budget of `MAX_LOADED_MEMBERS` (8, `src/shared/combined.ts`). Over it, the least recently shown background tabs are paused and offer a Load button.
- A combined tab holds up to `MAX_COMBINED_MODELS` (6) models in one scene.
- Each tab keeps its own view state, capped by `viewer/tabState.ts` at 5,000 node ids: `ViewerPane` saves it before the adapter is destroyed on pause or `pagehide` and restores it once after the next load, unless an incoming `?view=` link is waiting. The model tab menu's **Remember view state** entry turns this off and clears the state.
- `ModelRouteSync` keeps the URL and the store in step.

Share links (`api/viewLink.ts`) carry the camera and selection (version 1), the pane and chart state (version 2) and per-model hidden and isolated node ids (version 3). `viewer/shareLink.ts` captures them from `adapter.getState()`; `viewer/incomingLink.ts` restores an opened link (read from the router search, applied once, cleared through the router) and calls `restoreState` after the models load. Nothing is stored on the server. A link opens only for people who already have Autodesk access to the files: there is no public token route, public viewer or copy of a hub model, and the Share menu says so.

### Persisted records

`src/web/storage.ts` is the only code that touches browser storage.

- `defineRecord({ key, initial, sanitize, area?, codec? })` returns a record with `read`, `write`, `remove`. Reads are always sanitized.
- `usePersisted(record)` is the React hook: `[value, update, reset]`. It re-reads when the record's key changes, so one component can serve several panels.
- `defineRecordFamily` makes one record per argument. Its prefix must be in `BSH_PERSONAL_PREFIXES`, and `get` and `forget` throw for a key outside that prefix.
- `BSH_KEYS` lists the fixed keys as `personal` (cleared on sign-out) or `preference` (kept). Keys under `BSH_PERSONAL_PREFIXES` are personal too, so a new `bsh.pane.*` key is forgotten even when it is not in the list.
- `forgetPersonal()` runs on sign-out and when the owner changes.
- Paint history (`tools/paint/paintHistory.ts`) is one personal record per model version with the ordered paint actions and an undo cursor. `.onModelsReady` on the paint tool replays it after the object tree answers, dropping ids that no longer resolve.
- Tests swap in `memoryAdapter()` with `setStorageAdapter`.

The keys are listed in [development.md](development.md#storage-keys).

### User-made items

`src/web/store/savedStore.ts` holds viewpoints, selection sets, dashboard presets, export presets and model sets in one personal record (`bsh.saved.v1`). Each kind is declared once with `defineSavedKind` (`store/savedKinds.ts`), which registers it through `registerSavedKind` (`store/savedKindRegistry.ts`) and returns a typed handle. The production kinds are `viewpoint` (`viewer/viewpoints.ts`), `selection-set` (`viewer/selectionSets.ts`), `dashboard-preset` (`extensions/dashboardPresets.ts`), `export-preset` (`tools/excel/exportPresets.ts`), `summary-preset` (`extensions/summaryPresets.ts`), `report-template` (`viewer/reportTemplates.ts`), `color-rules` (`extensions/colorRulePresets.ts`), `federation` (`viewer/savedFederations.ts`) and `model-set` (`store/modelSets.ts`), all at version 1. A summary preset stores its property list and the summary view as opaque JSON, so a preset written by a newer build keeps fields this build does not know; applying one sanitises the view, turns an older `measure` and `hiddenColumns` into `columns` and leaves the other unknown keys in place, which is why the kind stays at version 1. The export envelope is `bsh-saved` version 2 with a per-kind version map; import merges by id.

A federation is a saved combination of open models (`viewer/savedFederations.ts`, saved kind `federation`). It keeps up to six members, primary first, with each member's recalled context without `with`, its tint, whether it was hidden and whether it follows the latest version. Offsets are keyed by member URN. `captureFederation` reads the open tab, `resolveFederation` asks `latestVersionUrn` for each `latest` member and remaps the URN, its offsets and its tint, and `federationOpenPlan` turns the result into the open call (`with`, offsets, tints, hidden URNs). The Models pane saves and lists them; the palette reopens them through a command hook on the pane, and the Models pane supplies the opener.

A model set is an ordered list of at most 24 model versions, each pinned to its version or following the item's latest one; unknown fields on the set and on a member survive a round trip, so a later kind can add tints or offsets without a version bump. Opening a set resolves the "latest" members through the versions route and opens tabs, or one combined viewer of up to `MAX_COMBINED_MODELS`. A document search stores the deep search filters and whether the search covered the loaded folders or the whole project; it holds no project id, so it applies to the current root.

A selection set stores dbIds per model plus optional stable external ids (`keys`). `viewer/setResolution.ts` owns resolving a set: `resolveSet` and `scopeElementItems` map keys back through `adapter.getExternalIdMap` (cached per model version) and never write, with `undefined` meaning the set is gone. Only `selectSet` and `migrateSelectionSet(s)` persist the move of dbIds into keys. `mergeSetData` keeps the union or the intersection by identity (model plus key or dbId).

### Scoped rows

Summary, Dashboard and exports read property rows the same way: `useScopedRows` in panels and `readScopedRows` (`viewer/scopedRows.ts`) in async code. The seam owns model resolution, element scope, the failure report and the scope note. `readScopedRows` returns partial rows with `failed` naming the models it could not read, so callers check it. `peekScopedRows` is the cache-first reopen path for Summary and Dashboard and the count probe. It takes the requested property names optionally: with names it returns `null` unless the cache is complete for exactly those names, so a pane that grows its column list re-reads instead of showing `(empty)`; without names the count path accepts any cached rows. The hook keeps its own live element scope — it reads with `elements: 'all'` and applies selection and visibility changes without restarting the read — so the status does not flicker.

- Dashboard and Excel choose their columns from the shared property catalog: `PropertyPicker` (`panels/PropertyPicker.tsx`) lists what `usePropertyCatalog` discovered, and the chosen names become the `names` of the scoped read. A dashboard view carries its own list in `properties`: the main Dashboard in `bsh.dashboard.view.v1`, each chart instance in `bsh.pane.chart.<n>.v1`, so two charts can chart different properties. Excel keeps its columns in its tool settings (`bsh.tool.excel.v1`). The export drops columns from the same rows rather than reading the model again.
- Scope is a model (`ALL_MODELS` or one model id) plus elements (`all`, `selected`, `visible`, `isolated` or `set:<id>`). Summary and Dashboard always read `all`; an element scope saved by an older build is dropped. `ALL_MODELS` covers the visible models only, because `getLeafProperties` skips hidden ones, and the option reads "All visible models" while a ready model is hidden. A scope note that counts rows from two or more models names them, e.g. `(A.rvt 8, B.rvt 4)`.
- `viewer/sharedLeafRows.ts` keeps one cache per adapter and model. A read reports progress as `{ phase, loaded, total, partial }` (`propertyReads.ts`), where `partial` means `loaded < total`. The adapters report every 5,000-element chunk and `throttleProgress` coalesces it to at most one event per 100 ms, always emitting the first and the final one; `sumProgress` does the same across models, so Summary, Dashboard and Export share one shape and one cadence.
- Cancelling a read rejects at once instead of waiting for the batch in flight: `readInChunks` races each chunk against the signal and checks it before issuing the next. A cancelled or failed model read writes nothing to the cache, so partial rows never look complete.
- A cache entry is either complete for the names it holds or absent. `refreshLeafRows` (the pane Refresh) and a model version change do not drop rows: they mark the entry `stale`, keep it for display, and the next read replaces it. A failed refresh leaves the stale rows in place. `peekLeafRows` returns stale rows, `leafRowsStale` reports them, and `forgetLeafRows` is the only hard drop; nothing in the app calls it today except tests, so a cache lives as long as its adapter. An empty read is cached only when the adapter reported a complete tree (`total: 0`).
- The hook is cache-first: opening a pane on a complete cache shows the rows without reading. A stale cache is re-read only when `autoRefresh` is on (the Summary setting); otherwise the pane shows "Data may be stale" next to Refresh. Dashboard always refreshes manually.
- The hook returns status, progress, `stale`, `refresh` and `cancel`, plus `partialRows` while a read is loading. Partial rows come from `ReadOptions.onRows`, which both adapters call once per chunk; the hook publishes them at the same 100 ms cadence as progress, and they are never cached, so a cancelled read leaves nothing behind. Two panes that ask for covered property names share one in-flight read per model.
- The `selected` scope refreshes live (the selection event, debounced; the latest result wins). `visible` and `isolated` refresh on the adapter's visibility event (debounced). `set:<id>` is read once per read or refresh; use Refresh after editing a set.

## ViewerAdapter

`viewer/ViewerAdapter.ts` is the only way panels and tools reach a viewer. It covers:

Groups of methods: lifecycle (`load`, `resize`, `destroy`, `setTheme`), model sets (`loadModels`, `addModel`, `removeModel`, `getModels`), properties (`getLeafProperties`, `discoverProperties`, `searchElements`), selection and actions (`getModelSelection`, `selectModelIds`, `isolateModelIds`, `fitToView`), state (`getState`, `restoreState`, `getScreenshot`), paint, measurements (`listMeasurements`, `startMeasure`, `clearMeasurements`), `registerToolGroup` and export sources (`getGeometryParts`, `getIfcSource`).

`searchElements(text, { attributes, signal })` asks every shown model for the dbIds whose name or property value matches, returns them as `{ modelId, dbId }` pairs and names in `failedModels` the models whose search threw or is unavailable. Hidden models are skipped, like `getLeafProperties`. A blank search resolves empty without calling the viewer. The Search elements pane caps the list at 5,000 and names the first 200 rows through `getElementsProperties`.

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
- `getPlacementInfo()` reports, per model, its unit, whether its data carries shared coordinates (`null` when unknown) and the distance between its box centre and the anchor's after offsets, in metres. A model without a box reports no distance.
- A model source may carry `view`, a viewable guid. `pickGeometryNode` picks that node when it exists and matches the anchor's dimension. `adapter.listViews(modelId)` reports every geometry node as `{ id, name, role, current }`; the mock lists `mock-3d` (“{3D}”) and `mock-a101` (“A101 - Plans”). A single-model tab switches by reloading with the view (`loadModels([{ ...source, view }])`); a combined tab only accepts the anchor's dimension and then swaps the model with `removeModel` + `addModel`. `viewer/views.ts` holds the switch and the per-document preferences; `ViewerPane` adds the stored start view to its load sources, and paint records include the view in their hash.
- Offsets are view-only and applied with `setPlacementTransform`. `viewer/alignment.ts` holds the edits: `nudgeOffset` converts metres to model units with `metersPerUnit` and keeps the other models, `snapToAnchor` takes the adapter's `getTogetherOffsets()` entry for that one model, and `resetOffset` removes it and returns `null` when nothing is left. The Models pane writes them through `store.setView(urn, { offsets })`, which `ViewerPane` applies with `setModelOffsets`; no adapter write method is added. Every control says the files and their coordinates do not change.
- `getLeafProperties` skips hidden models. A model whose properties fail gets `propertiesError`.

### Toolbar group

The real adapter mounts tools as the Autodesk extension `BimShowcaseHub.Tools` (`viewer/autodeskTools.ts`). The mock adapter shares `viewer/toolGroupController.ts`.

### Colour layers

`viewer/colorLayers.ts` is the only path from UI state to `viewer.setThemingColor`, and `RealViewerAdapter.setModelThemingColor` / `clearModelThemingColors` are the only two methods that call it. The module is pure data and resolution with no React and no Autodesk types.

- A layer is `{ source, assignments: Map<modelId, Map<dbId, Color>> }`. The sources are `paint`, `chart` and `modelTint`, in that priority order: the first layer that assigns an element owns its colour. The resolver sorts the layers by that order itself, so a caller cannot reorder them by accident.
- The owner resets: `clearSource(source)` removes only that layer's assignments, so clearing paint falls back to a chart colour, and clearing that falls back to the model tint. Nothing clears another layer's data.
- One controller per adapter (`colorLayersFor`, a `WeakMap`) keeps the last applied resolution. Applying resolves, diffs exactly (`sameColor`), sets only changed elements and clears only elements no lower layer covers, so re-applying an identical resolution calls the viewer zero times. Work is chunked by `THEMING_CHUNK_SIZE` (2048).
- Per-element clearing uses `setThemingColor(dbId, null, model)`, the Viewer 7 selective reset. Sets call `model.setThemingColor` and invalidate once per chunk when the model exposes it, and fall back to `viewer.setThemingColor` for each id otherwise.
- The adapter drops the layer state on `unload` and for a removed model, because the viewer drops the colours there too.
- The Models pane owns the `modelTint` layer: a swatch per model, a palette per model set (else the global palette), "tint strength" as the alpha of the theming colour (0.1 to 1, clamped to 0.05 steps), and a reset that clears only that layer. Paint uses the `paint` layer through `applyPaintPlan` / `resetPaint`.
- The `chart` layer has one owner: `viewer/modelColoring.ts` keeps at most one `Coloring` per adapter and writes it with `replaceSource`, so property colouring, chart colouring and rules replace each other instead of stacking. The Colors pane, the chart menu and the export read that same store; paint still wins above it and the model tint sits below.
- Ghosting has one owner per adapter, `viewer/ghosting.ts`. Colors, the model tint and paint call `claimGhosting(adapter, claimant, solid?)` and `releaseGhosting(adapter, claimant)` instead of `setGhosting`: ghosting is on while any claim exists, and the union of the claims' solid sets is the one isolation. Releasing the last solid set un-isolates only when the isolation is still the one the owner set, and never touches hidden elements, so the user's own isolation and hiding survive. Ghost others isolates the focus model this way, and so does rules colouring with **Ghost the rest**.

- **Top bar** (`components/TopBar.tsx`): the brand, the active model's breadcrumb and the page actions, then the Help menu, Settings, theme and account. `LayoutProvider` passes the breadcrumb as `context` and `AppShell` renders the bar without one, so every prop is optional. The breadcrumb (`components/breadcrumb.ts`, `ModelBreadcrumb.tsx`) keeps the first folder and the last two around an ellipsis and ends with the file and version; a folder crumb reveals the model in Documents, and `bsh.topbar.v1` chooses full path, file only or nothing. The Help menu opens the keyboard shortcuts window, whose rows come from `COMMANDS` (`help/shortcutRows.ts`) plus the fixed shortcuts, and links to the docs.

### Interface language

`src/web/i18n` is the only source of display text: `en.ts` is the catalog (`as const`), `ru.ts` is a partial map with a per-message English fallback, and `useT()` / `translateNow()` are the two readers. Settings > Language writes `bsh-settings-v1`, `applyAppSettings` sets `<html lang>` and the pre-paint script does it before the first paint. Coverage is partial by design: the top bar, Help, Settings, the Panes menu, the onboarding hints and the Documents welcome state are translated, and the viewer, Summary, Dashboard, tools and exports are a follow-up. Exports stay English whatever the language, and the catalog test prints the coverage instead of failing on a gap. The Autodesk Viewer chrome keeps its own language, set by the viewer option at init, so switching it needs a viewer reload and is out of scope.

### Resize, full screen and theme

Each adapter has one resize scheduler (`viewer/resizeScheduler.ts`) that merges requests from the host `ResizeObserver`, the window and full-screen events. Moving a pane moves its host element, so the adapter and canvas are never recreated. `ViewerPane` also calls `adapter.setTheme` on creation and on every theme change.

## Extension points

Tools, commands, settings and panes are described in [extensions.md](extensions.md). The app shell depends on the tool registry, never on a concrete tool.
