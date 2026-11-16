# Architecture

The app is a React single-page client and a small Express server. The server holds the Autodesk credentials and tokens. The client talks only to `/api`.

## Server

`src/server/index.ts` exports `createApp(config, deps)`. It builds an Express app with:

- `cookie-session` named `bim-hub-session`: signed with `SESSION_SECRET`, `httpOnly`, `sameSite=lax`, `secure` in production, one hour `maxAge`.
- `apiRouter` mounted at `/api`, made of `health`, `auth` and `data` routers. Unknown `/api` paths return 404 JSON.
- In production, static files from `dist/web` (or `STATIC_DIR`) and an `index.html` fallback for client routes.
- `errorHandler`, which returns `{ error }` JSON. Unexpected errors become a 500 with a generic message and only the error name is logged.

Two entry points use `createApp`: running `src/server/index.ts` directly (dev and `npm start`) listens on `PORT`, and `api/index.ts` exports the app as the default export for the Vercel function.

Configuration lives in `src/server/config.ts` (`loadConfig`). Mock mode is `MOCK_APS=1` and only when `NODE_ENV` is not `production`. In production the config throws if `SESSION_SECRET` is missing or `change-me`, or if `APS_CLIENT_ID` or `APS_CLIENT_SECRET` is missing. Scopes are `data:read` and `viewables:read`.

### Routes

| Route | Purpose |
|---|---|
| `GET /api/health` | `{ status: "ok", mock }` |
| `GET /api/session` | Signed-in user, or 401 |
| `GET /api/auth/url` | Authorization URL for Autodesk sign-in |
| `GET /api/auth/callback` | OAuth redirect target |
| `POST /api/auth/signout` | Clears the session, returns 204 |
| `GET /api/viewer/token` | Short-lived access token for the viewer |
| `GET /api/hubs` | Hubs |
| `GET /api/hubs/:hubId/projects` | Projects in a hub |
| `GET /api/hubs/:hubId/projects/:projectId/folders` | Top folders of a project |
| `GET /api/projects/:projectId/folders/:folderId/contents` | Folders and items in a folder |
| `GET /api/projects/:projectId/items/:itemId/versions` | Versions of an item |

## Auth flow

1. The client calls `GET /api/auth/url`. The server creates a random `state` (24 random bytes, base64url), stores it in the session as `oauthState`, and returns the Autodesk authorize URL built with `@aps_sdk/authentication`.
2. The browser goes to Autodesk and returns to `APS_CALLBACK_URL` (`/api/auth/callback`).
3. The callback removes `oauthState` from the session and compares it with the `state` query parameter using `timingSafeEqual`. Failures redirect to `/?auth_error=<code>` and the landing page shows a dismissible message: `invalid_state` for a state mismatch, `access_denied` for an `error` parameter, `missing_code` for a missing `code`, and `upstream_error` when the code exchange or user lookup fails.
4. The server exchanges the code for tokens, fetches the user info, stores both in the cookie session (`sessionTokens.ts`) and redirects to `/`.
5. Data routes call `getAccessToken`. It returns the stored access token while more than 60 seconds remain, otherwise it refreshes with the refresh token and stores the result. If the refresh fails, the auth data is cleared and the route returns 401 "Session expired".

The session is a signed cookie, not a server-side store, so tokens live in the cookie payload. Sign-out sets the session to null.

`/api/viewer/token` returns `access_token` and `expires_in` from the same session token, because the Autodesk Viewer needs a token in the browser.

## Data management mapping and opaque ids

`apsDataService.ts` wraps `@aps_sdk/data-management` (hubs, hub projects, top folders, folder contents, item versions). `mapping.ts` converts API resources into one shape, `TreeNode` from `src/shared/types.ts`: `id`, `kind` (`hub`, `project`, `folder`, `item`, `version`), `name`, `hasChildren`, `viewable`, optional `viewState` (versions only), optional `urn` and `parentId`.

Rules in the mapping:

- Resources without an id are skipped. Folder contents without a name, or of a type other than `folders` or `items`, are skipped.
- A version carries its derivative URN. The mapping alone cannot tell whether the URN has geometry, so it starts as `unknown` (URN present) or `not-translated` (no URN).
- A version name reads `v<number>: <YYYY-MM-DD HH:mm> by <user>`.

### View state

A derivative URN does not mean the model can be opened: a manifest can hold only a thumbnail, or not exist. When versions are listed (`listItemVersions`, which runs when the user expands a file, never for the whole tree), `data/viewState.ts` reads `GET /modelderivative/v2/designdata/{urn}/manifest` with the user's token and classifies each version into `TreeNode.viewState` (`src/shared/viewState.ts`):

| State | Meaning | `viewable` |
|---|---|---|
| `ready` | An `svf` or `svf2` derivative has status `success` or `partialsuccess` | true |
| `processing` | Manifest `pending` or `inprogress`, or a geometry derivative still running | false |
| `failed` | Manifest or geometry derivative `failed` or `timeout` | false |
| `no-geometry` | Manifest `success` without an `svf` or `svf2` derivative (for example a thumbnail only) | false |
| `not-translated` | No manifest (404 or an empty body), or no derivative URN | false |
| `unknown` | The check could not run (401, 403, 429, 5xx, a timeout, a network error), the status is not recognised, or the version is older than the checked window | true |

`viewable` stays in the API for compatibility and is derived from `viewState` by `viewableFor` (`src/shared/viewState.ts`); the client reads `viewState` only, through `viewStateOf`. `unknown` counts as viewable so a transient failure does not hide a model. Per version list only the newest 5 versions (`CHECKED_VERSIONS`) are checked, and the whole list waits at most 6 s (`LIST_BUDGET_MS`); versions that were never checked because they are over that limit come back `unknown` with `checked: false`, and versions whose check failed or ran out of time come back `unknown` without it. `GET /api/projects/:projectId/items/:itemId/versions/:versionId/view-state` checks one version on demand with the same classifier, cache and token-scoped key and returns `{ viewState, viewable }`. Documents calls it before it opens, picks or adds a never-checked version: a blocked result shows the usual notice, `ready` proceeds, and a failed call proceeds as `unknown`. A Shift range checks only the versions inside the range; each version is checked once at a time and at most 4 checks run at once. A result is kept only while the version list it came from is current: a refetch, polling or Check again drops it, and failed or `unknown` results are never kept. Polling ignores never-checked versions but treats an on-demand `processing` result as pending. The manifest is read from the global endpoint with the `region` header of the version's data centre (`EMEA` when the decoded URN names `emea`, `US` when it names `wipprod`, see `src/shared/region.ts`). When the URN does not name its region the US data centre is asked first and a 404 is retried in EMEA before the version counts as `not-translated`; any other error is `unknown`. The cache key includes the region. The checker runs at most 4 manifest requests at once, aborts a request after 8 s, shares one request between concurrent checks and caches the result per process, keyed by a hash of the access token plus the URN so users never share results: 60 s for `ready`, `no-geometry`, `failed` and `not-translated`, 10 s for `processing` and `unknown`. Expired entries are dropped when read and swept at most once every 30 s on write and the oldest live entry is evicted only when a new key is inserted at the 2000 entry limit. A failed check yields `unknown` and never fails the version list. Logs and errors carry neither the token nor the URN. The existing `data:read` scope covers the read; no new scope is needed.

Autodesk ids contain characters such as `:`, `/` and `?`. `ids.ts` encodes every id with base64url before it leaves the server and decodes it on the way in. `decodeId` accepts only `[A-Za-z0-9_-]` up to 2048 characters and rejects anything that does not re-encode to the same string, so route parameters cannot carry arbitrary text to the APS SDK. Failures return 400 "Invalid id".

Upstream errors pass through `toHttpError`: 404 stays 404, 401 and 403 become 401, everything else becomes 502.

## Mock mode on the server

With `config.mock`, `createMockDataService()` replaces the APS data service and the auth routes answer from fixtures: `/api/session` returns the mock user, `/api/auth/url` returns `/`, `/api/viewer/token` returns a fake token. The fixtures are in `src/server/mock/fixtures.ts` (two hubs, several projects, nested folders, items with versions). The `View States` folder in the first project of the first hub holds one file per state (`STATE-ready.rvt`, `STATE-no-geometry.rvt`, `STATE-processing.rvt`, `STATE-not-translated.rvt`, `STATE-failed.rvt`).

## Client

`src/web/main.tsx` renders `App`, which provides a TanStack Query client and a TanStack Router.

### TanStack usage

- **Router** (`routes/router.tsx`): a root route renders `AppShell`, an index route renders `EmptyState`, and `/model/$urn` renders nothing: `ModelRouteSync` in the layout opens or activates that model. Search parameters (`file`, `v`, `crumbs`, `trail`) are validated by `parseModelContext`. They carry the file name, version label and tree path from the tree to the model tab.
- **Query** (`api/hooks.ts`, `queryClient.ts`): the session query (`['session']`, no retry) decides between the landing page and the app. Each tree node's children are a query keyed by `scopeKey`, with a 5 minute stale time. Sign-out removes the children queries and clears the session. Sign-in fetches the authorize URL and assigns `window.location`.
- **Table** (`panels/SummaryTable.tsx`): renders the model summary.
- **Virtual** (`components/tree/DocumentTree.tsx`): virtualizes tree rows.

### Tree

`components/tree/DocumentTree.tsx` uses `@headless-tree/core` with the async data loader feature. Rows are loaded on expand through the children queries and rendered by `TreeRowView` with `role="treeitem"`, `aria-level`, `aria-expanded` and, for versions, `data-viewable` (true only for `ready` and `unknown`) and `data-view-state`. `api/scope.ts` maps a node and its ancestors to the right endpoint (`childrenPath`). Only versions whose state is `ready` or `unknown` open the model route. Selecting any other version, with the pointer or Enter, opens no tab and shows an explanation in an aria-live notice above the tree, with a Check again button that refetches that item's versions. Blocked rows also carry the reason as visually hidden text linked with `aria-describedby`, and in their `title`. While an expanded item has a `processing` version the tree refetches its versions every 15 s (not while the page is hidden); an item with only `unknown` versions is refetched at most 3 times. `TreePanel` adds the filter box. It is the Documents pane of the layout: resized with the dock sash on wide screens and shown as an overlay below 876 px.

### Layout

`AppShell` handles the session and the skip link. When signed in it lazily loads `LayoutProvider` (`src/web/layout`), which renders the top bar and the panes. Each pane comes from the registry in `paneRegistry.ts` (Documents, Viewer, Model summary, Dashboard). Documents is the only required pane and the main one: the app starts with Documents alone and the viewer, with summary and dashboard, opens from the selected document and is rendered once into a detached host element through a React portal; a layout only attaches those hosts to its slots. From 876 px wide the dock (`DockLayout.tsx`, built on `dockview-react`, lazy loaded) arranges the panes and lets the user move, tab, float, collapse and close them; below that `StackedLayout.tsx` shows a fixed column with the tree as an overlay. The arrangement is saved in `localStorage` under `bsh.layout.v2`. See [layout.md](layout.md).

`ViewerProvider` sits in `LayoutProvider`. Each `ViewerPane` publishes its adapter under its URN and provides it to its own subtree, so `useViewer()` inside a model tab returns that tab's adapter and anywhere else returns the active model's adapter.

### Open models

Several models can be open at once. `api/openModels.ts` holds the open-models store: the open URNs with their `file`, `v`, `crumbs` and `trail`, the active URN, and the loaded (`live`) URNs, least recently shown first. It is saved in `sessionStorage` under `bsh.models.open`, so a reload restores the tabs and a new browser tab starts empty. Each open model is a dock tab (`viewer:<urn>`) with its own `ViewerPane` and adapter; its title is the file name and version, with the breadcrumb path and URN as the tooltip (`modelTabTitle` in `routes/ModelPage.tsx`).

`routes/ModelRouteSync.tsx` keeps the router and the store in step: `/model/$urn` opens that model or activates its tab (never a duplicate), activating a tab replaces the URL with that model and its search parameters, closing the active tab activates its neighbour, and closing the last one navigates to `/`. It also sets the document title from the active model.

A model loads only when its tab is first shown, so restored background tabs cost nothing until they are activated. At most `MAX_LOADED_MODELS` (4) models are loaded; showing another destroys the adapter of the least recently shown background model and leaves its tab with a "Paused to save memory" state and a Load button.

While no model is open the Documents pane is the `main` landmark (`id="main"`) and shows the route content (the empty state hint or not found) next to the tree. A model tab is the `main` landmark while it is active. The viewer fills the tab edge to edge: there is no model header. The export status badge is an overlay inside the viewer. Paint and export are not in a page toolbar: they live in the viewer toolbar as a tool group. The summary and the dashboard are their own panes. Summary and dashboard read the active model's adapter and fetch property rows through `usePropertyRows`; `viewer/sharedLeafRows.ts` batches and caches the reads per adapter, so switching tabs does not read again (Refresh forgets the cache). The summary names the model it shows, and its dock tab tooltip says `Model summary of <model>`. Collapse state lives in the layout record (`collapsed`); in the dock it shrinks the pane's group to its header, in the stack the panels' own toggles show it.

## ViewerAdapter contract

`viewer/ViewerAdapter.ts` is the only surface panels and extensions use to reach a viewer:

```ts
interface ViewerAdapter {
  load(urn: string): Promise<void>;
  unload(): void;
  resize(): void;
  clearSelection?(): void;
  clearThemingColors(): void;
  setTheme(theme: Theme): void;
  getLeafProperties(propertyNames: string[]): Promise<PropertyRow[]>;
  registerToolGroup(spec: ToolGroupSpec): () => void;
  onSelectionChange(cb: (items: ModelDbId[]) => void): () => void;
  destroy(): void;
  loadModels(sources: readonly ModelSource[]): Promise<ModelInfo[]>;
  addModel(source: ModelSource): Promise<ModelInfo>;
  removeModel(modelId: string): void;
  getModels(): ModelInfo[];
  setModelVisible(modelId: string, visible: boolean): void;
  onModelsChange(cb: (models: ModelInfo[]) => void): () => void;
  getModelSelection(): ModelDbId[];
  setModelThemingColor(items: readonly ModelDbId[], color: Rgba): void;
}
```

### Model sets (combined view)

One adapter can hold several models in one viewer and one scene (`viewer/modelSet.ts`). A source is `{ urn, name? }`; a model is `{ id, urn, name, visible, status, error? }` with `id === urn` and `status` one of `loading`, `ready`, `error`. `load(urn)` is `loadModels([{ urn }])`, so a single model is a set of one. The set holds at most `MAX_COMBINED_MODELS` (6) models: more throws `ModelSetError` (`limit`) before anything loads, and adding a urn already in the set throws `ModelSetError` (`duplicate`). A model whose load failed stays listed with its error but does not count toward the cap, and adding its urn again retries it in place.

- **Startup.** The viewer starts once per adapter: concurrent `addModel` calls share one start, and an empty but live viewer is reused. If the script, the token, the Autodesk initializer or `viewer.start()` fails, the models being added get that real message as their error. On a destroyed adapter `addModel` throws `ModelSetError` (`closed`) and no model is marked failed.
- **Error isolation.** Each model loads on its own. A failing model gets `status: 'error'` and a message, and the others keep loading. `loadModels` rejects only when every model failed; `load` therefore still rejects when its one model fails.
- **Selection.** dbIds collide across models, so selection is read as `{ modelId, dbId }` pairs with `getModelSelection()`. There is no model-less selection or paint API: `onSelectionChange` passes the same pairs and fires for a selection in any model, and the tool group only asks whether `getModelSelection()` is empty. The real adapter listens to `AGGREGATE_SELECTION_CHANGED_EVENT`, because the Autodesk viewer fires `SELECTION_CHANGED_EVENT` only while exactly one model is loaded. Hiding a model clears its selection (the real adapter calls `viewer.select([], model)` before `hideModel`) and selection reads skip hidden models, so showing it again does not bring the old selection back.
- **Paint.** `setModelThemingColor` paints per model; `clearThemingColors()` clears every model.
- **Properties.** `getLeafProperties` returns the rows of every ready and visible model, tagged with `modelId` and `modelName`. Hidden models are left out on purpose: summary, dashboard and export follow what is on screen, and toggling visibility triggers a fresh read. If one model's property database fails, the others' rows are still returned and that model gets `propertiesError` (its `status` stays `ready`, its geometry is fine); `unavailableModels(models)` lists them so the UI can say which model is missing. It rejects only when every visible model fails. `viewer/modelScope.ts` filters rows by model (`scopeRows`, `ALL_MODELS`, `modelScopeOptions`); counting the union sums values across models.
- **Row cache.** `sharedLeafRows.ts` keys its shared reads by the set of ready models, and `usePropertyRows` re-reads when that set changes (`useModels`, `useReadySignature`).
- **Alignment (real adapter).** Same recipe as Autodesk's `AggregatedView`: every model loads with `keepCurrentModels: true` and `applyRefPoint: true` (Revit shared coordinates). The first model that loads is the anchor; the others get its `globalOffset` and `applyScaling: <anchor unit>`, so models in feet and metres line up. The anchor loads first and the rest in parallel; the view fits the whole set after the first batch and after each added model. The offset and unit survive removing the anchor until the set is empty. A 2D-only file cannot join a 3D set (and the reverse), and a model from another region than the first fails, each with a per-model error.
- **Far apart models.** After a load the adapter compares model bounding boxes (`getSpread`): when the largest distance between model centres is more than 10 times the largest model diagonal, the Models menu and the tab tooltip say "Some models are far apart in model space (about N km). They are shown at their real positions.", and the initial camera fits the first (anchor) model instead of the whole set, so the scene is not a speck. "Bring models together (view only)" moves every other model so its bounding box centre sits on the anchor's (`getTogetherOffsets`, `setModelOffsets`); the real adapter changes only the placement through `viewer.impl.setPlacementTransform(model, matrix)` (present in Viewer 7.131: it sets the model placement, fires the transform event and invalidates), adding the offset to the original placement's translation, and "Restore positions" puts the original placement back. Offsets live in the adapter's model set, so hiding and showing a model keeps them, a model loaded later picks up its saved offset, and the open-models store keeps them with the combined tab (`offsets`, plus `spread` for the tooltip) so a reload restores them. Removing a member drops its offset; removing the anchor drops them all.
- **No geometry.** A document whose manifest has no 3D or 2D geometry node fails with "No viewable geometry: this file was translated but has no 3D or 2D view." (`NO_GEOMETRY_MESSAGE` in `federation.ts`), on its own.
- **UI.** `ViewerPane` takes `members` besides `urn`: it loads them with `loadModels`, then adds and removes members in place when they change, shows a Models menu (`ModelsMenu.tsx`: show or hide, remove, Add model... which reveals Documents) and lists failed members with their reason and a Remove button. A cap or duplicate refusal shows as an alert.
- **Test hook.** The real adapter marks its container with `data-bsh-viewer` and sets a `bshViewer` property on it, so e2e scripts reach the right viewer without the global `NOP_VIEWER`.

`ToolGroupSpec` describes one group: an id and title, a paint tool (swatches, a reset entry, hints and `onPaint`/`onReset` callbacks) and an export tool (`onExport`). `registerToolGroup` returns a disposer.

`createViewerAdapter` picks the implementation. It uses the mock adapter only when `import.meta.env.DEV` is true and `VITE_MOCK_APS=1` (or `window.__MOCK_APS__`). Otherwise it dynamically imports the real one. The mock adapter is a dynamic import behind the dev check, so a production build contains no mock viewer code.

- **RealViewerAdapter** loads the Autodesk Viewer 7.* script and style from `developer.api.autodesk.com`, initializes it once per page with a `getAccessToken` callback that calls `/api/viewer/token` (concurrent loads share one `Initializer` call, and a 401 from the token route marks the session as signed out), picks the `derivativeV2_EU` API when the decoded URN contains `emea` and `derivativeV2` otherwise, and starts a `GuiViewer3D`. The Autodesk Viewer cannot be initialized twice, so opening a model from the other region after the page was initialized rejects with a clear error and asks for a page reload. Property rows come from `getBulkProperties` over the leaf nodes of the object tree. `setTheme` applies the viewer's `dark-theme` or `light-theme` and sets the scene background from the `--color-graphite` and `--color-void` tokens (`sceneBackground.ts`). It is applied at start, again after the model loads, and on every theme change. Several adapters share the page: the `Initializer` still runs once, so all open models must come from one region. Autodesk's `MainLoop.unregisterViewer` splices by `indexOf`, so finishing a viewer that never started would remove another viewer from the shared render loop; the adapter therefore calls `tearDown` and `finish` only for a viewer whose `start()` succeeded, at most once, and drops a failed viewer's DOM instead. An exception in the shared render tick stops it for every viewer, so selection listeners are wrapped and their errors are logged instead of thrown; a failed load leaves an error state in that tab only.
- **MockViewerAdapter** draws a fixture building as SVG labeled "Mock building model", supports selection by click, theming colors, a fake toolbar with the same tool group, a `data-viewer-theme` attribute for the theme, and generated property rows from `mockModel.ts`. Each model of a set is its own SVG group (`data-model-id`), placed side by side; a urn containing `broken` fails to load, for per-model error tests. Outside tests it adds a large synthetic set of rows (104,000) so export and summary behave with a realistic size.

### Autodesk tool group

The real adapter mounts the tool group as an Autodesk Viewer extension, `BimShowcaseHub.Tools` (`viewer/autodeskTools.ts`). Once the model has loaded and a group is registered, the adapter loads the extension with a `ToolGroupController` as its option. The extension adds a control group to the native viewer toolbar with a paint combo button (red, green, blue and reset) and an export button, and keeps their enabled states in sync with the controller: swatches need a selection, reset needs something painted. Unregistering or `unload` removes the group. The controller (`viewer/toolGroupController.ts`) is shared with the mock adapter, so behavior and tests are the same for both.

### Resize flow

The viewer must follow its container when panes move, open, close, collapse or float, and when the window crosses the breakpoint. `ViewerPane` observes its host element with a `ResizeObserver` and listens to window `resize`. Events call `adapter.scheduleResize(250)`. Each adapter owns one scheduler (`viewer/resizeScheduler.ts`) that coalesces every request (host size, window, the Autodesk screen mode event, fullscreen changes and the viewer frame observer) into one `resize()` per animation frame plus one trailing `resize()` after the last request settles (250 ms for layout, 400 ms for screen mode). The layout also bumps a `resizeSignal` prop whenever the viewer's host is attached to a new slot or dockview moves the viewer pane, and `ViewerPane` then calls `adapter.resize()` once. The real adapter calls the Autodesk `viewer.resize()` only when the container has a non-zero size; it first clears any fixed pixel width or height on the viewer element, and if the render canvas still differs from the container afterwards it calls `viewer.impl.resize(width, height)` directly. The mock adapter refits its SVG view box. `ViewerPane` also calls `resize()` once after the model loads.

Moving the viewer never recreates it: the layout moves the host element, not the React tree, so the adapter and its WebGL canvas survive moves, tabs, floating groups and the breakpoint switch.

Full screen. The native toolbar button (`#toolbar-fullscreenTool`) calls `viewer.nextScreenMode()`. The default Autodesk delegate supports only normal and full screen: it adds `viewer-fill-browser` to the viewer's own `.adsk-viewing-viewer` element (`viewer.container`, a child of our host) and calls the browser Fullscreen API `requestFullscreen()` on it. It then calls `viewer.resize()` synchronously, before the request has taken effect, and fires `FULLSCREEN_MODE_EVENT`. Our host keeps its size, so the host `ResizeObserver` does not fire. Autodesk only resizes again from its own `fullscreenchange` listener, and only while entering; on exit through the button it resizes while still in full screen. So the real adapter sizes from the measured frame: the fullscreen element when it lies inside the host, otherwise the host. It never forces the canvas back to the host size while the viewer is in full screen. It listens to `fullscreenchange` and `webkitfullscreenchange` (resize now, then once per animation frame and again 400 ms later), to `FULLSCREEN_MODE_EVENT`, and observes `viewer.container` with a `ResizeObserver`, so the end of the browser's full-screen transition also resizes. On `fullscreenerror` it removes a leftover `viewer-fill-browser` class, which would otherwise pin the viewer with `position: fixed`. Esc, the button and the browser's own exit all end in `fullscreenchange`, so the host size comes back without reloading the model. Leaving the DOM exits full screen, so this works wherever the host is mounted. Our own overlays and panels sit outside the fullscreen element and are hidden while it is in full screen; the Autodesk docking panels, toolbar and ViewCube live inside it and follow the canvas.

### Theme

`ViewerPane` reads the theme from `useTheme()`, calls `adapter.setTheme` when the adapter is created and whenever the theme changes. See [design-system.md](design-system.md).

`ViewerPane` creates the adapter for a URN, loads the model, shows loading and error states, shows the export status as a badge inside the viewer, publishes the adapter through context and destroys it on unmount. `adapter.contract.test.ts` pins the contract on the mock adapter. `modelSet.contract.test.ts` runs the model-set contract against both adapters, the real one on a fake federated Autodesk viewer (`viewer/fakeFederatedViewer.ts`).

## Extensions

Behavior built on the adapter lives in `src/web/extensions` and `src/web/panels`. See [extensions.md](extensions.md).
