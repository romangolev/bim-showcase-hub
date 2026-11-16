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
3. The callback removes `oauthState` from the session and compares it with the `state` query parameter using `timingSafeEqual`. A mismatch returns 400 "Invalid state". An `error` parameter redirects to `/?auth_error=access_denied`. A missing `code` returns 400.
4. The server exchanges the code for tokens, fetches the user info, stores both in the cookie session (`sessionTokens.ts`) and redirects to `/`.
5. Data routes call `getAccessToken`. It returns the stored access token while more than 60 seconds remain, otherwise it refreshes with the refresh token and stores the result. If the refresh fails, the auth data is cleared and the route returns 401 "Session expired".

The session is a signed cookie, not a server-side store, so tokens live in the cookie payload. Sign-out sets the session to null.

`/api/viewer/token` returns `access_token` and `expires_in` from the same session token, because the Autodesk Viewer needs a token in the browser.

## Data management mapping and opaque ids

`apsDataService.ts` wraps `@aps_sdk/data-management` (hubs, hub projects, top folders, folder contents, item versions). `mapping.ts` converts API resources into one shape, `TreeNode` from `src/shared/types.ts`: `id`, `kind` (`hub`, `project`, `folder`, `item`, `version`), `name`, `hasChildren`, `viewable`, optional `urn` and `parentId`.

Rules in the mapping:

- Resources without an id are skipped. Folder contents without a name, or of a type other than `folders` or `items`, are skipped.
- A version is `viewable` when it has a derivative URN, and carries that URN.
- A version name reads `v<number>: <YYYY-MM-DD HH:mm> by <user>`.

Autodesk ids contain characters such as `:`, `/` and `?`. `ids.ts` encodes every id with base64url before it leaves the server and decodes it on the way in. `decodeId` accepts only `[A-Za-z0-9_-]` up to 2048 characters and rejects anything that does not re-encode to the same string, so route parameters cannot carry arbitrary text to the APS SDK. Failures return 400 "Invalid id".

Upstream errors pass through `toHttpError`: 404 stays 404, 401 and 403 become 401, everything else becomes 502.

## Mock mode on the server

With `config.mock`, `createMockDataService()` replaces the APS data service and the auth routes answer from fixtures: `/api/session` returns the mock user, `/api/auth/url` returns `/`, `/api/viewer/token` returns a fake token. The fixtures are in `src/server/mock/fixtures.ts` (two hubs, several projects, nested folders, items with versions).

## Client

`src/web/main.tsx` renders `App`, which provides a TanStack Query client and a TanStack Router.

### TanStack usage

- **Router** (`routes/router.tsx`): a root route renders `AppShell`, an index route renders `EmptyState`, and `/model/$urn` renders the lazily loaded `ModelPage`. Search parameters (`file`, `v`, `crumbs`, `trail`) are validated by `parseModelContext`. They carry the file name, version label and tree path from the tree to the page.
- **Query** (`api/hooks.ts`, `queryClient.ts`): the session query (`['session']`, no retry) decides between the landing page and the app. Each tree node's children are a query keyed by `scopeKey`, with a 5 minute stale time. Sign-out removes the children queries and clears the session. Sign-in fetches the authorize URL and assigns `window.location`.
- **Table** (`panels/SummaryTable.tsx`): renders the model summary.
- **Virtual** (`components/tree/DocumentTree.tsx`): virtualizes tree rows.

### Tree

`components/tree/DocumentTree.tsx` uses `@headless-tree/core` with the async data loader feature. Rows are loaded on expand through the children queries and rendered by `TreeRowView` with `role="treeitem"`, `aria-level`, `aria-expanded` and, for openable versions, `data-viewable`. `api/scope.ts` maps a node and its ancestors to the right endpoint (`childrenPath`). Only versions with a URN open the model route. `TreePanel` adds the filter box and the resizable width (260 to 480 px, 320 by default, stored in `localStorage` under `bsh.tree.width`). Below 1000 px the panel becomes an overlay.

### Model page

`ModelPage` wraps a `ViewerProvider` and shows the header (breadcrumb, title, URN copy), the viewer, the dashboard and the model summary. Paint and export are not in the page toolbar: they live in the viewer toolbar as a tool group. The summary is a rail beside the viewer that collapses to a narrow strip; its state is stored in `localStorage` under `bsh.summary.collapsed`, and the dashboard's under `bsh.dashboard.collapsed`. Panels read the active adapter from the viewer context and fetch property rows through `usePropertyRows`.

## ViewerAdapter contract

`viewer/ViewerAdapter.ts` is the only surface panels and extensions use to reach a viewer:

```ts
interface ViewerAdapter {
  load(urn: string): Promise<void>;
  unload(): void;
  resize(): void;
  getSelection(): number[];
  clearSelection?(): void;
  setThemingColor(ids: number[], color: Rgba): void;
  clearThemingColors(): void;
  setTheme(theme: Theme): void;
  getLeafProperties(propertyNames: string[]): Promise<PropertyRow[]>;
  registerToolGroup(spec: ToolGroupSpec): () => void;
  onSelectionChange(cb: (ids: number[]) => void): () => void;
  destroy(): void;
}
```

`ToolGroupSpec` describes one group: an id and title, a paint tool (swatches, a reset entry, hints and `onPaint`/`onReset` callbacks) and an export tool (`onExport`). `registerToolGroup` returns a disposer.

`createViewerAdapter` picks the implementation. It uses the mock adapter only when `import.meta.env.DEV` is true and `VITE_MOCK_APS=1` (or `window.__MOCK_APS__`). Otherwise it dynamically imports the real one. The mock adapter is a dynamic import behind the dev check, so a production build contains no mock viewer code.

- **RealViewerAdapter** loads the Autodesk Viewer 7.* script and style from `developer.api.autodesk.com`, initializes it with a `getAccessToken` callback that calls `/api/viewer/token`, picks the `derivativeV2_EU` API when the decoded URN contains `emea` and `derivativeV2` otherwise, and starts a `GuiViewer3D`. Property rows come from `getBulkProperties` over the leaf nodes of the object tree. `setTheme` applies the viewer's `dark-theme` or `light-theme` and sets the scene background from the `--color-graphite` and `--color-void` tokens (`sceneBackground.ts`). It is applied at start, again after the model loads, and on every theme change.
- **MockViewerAdapter** draws a fixture building as SVG labeled "Mock building model", supports selection by click, theming colors, a fake toolbar with the same tool group, a `data-viewer-theme` attribute for the theme, and generated property rows from `mockModel.ts`. Outside tests it adds a large synthetic set of rows (104,000) so export and summary behave with a realistic size.

### Autodesk tool group

The real adapter mounts the tool group as an Autodesk Viewer extension, `BimShowcaseHub.Tools` (`viewer/autodeskTools.ts`). Once the model has loaded and a group is registered, the adapter loads the extension with a `ToolGroupController` as its option. The extension adds a control group to the native viewer toolbar with a paint combo button (red, green, blue and reset) and an export button, and keeps their enabled states in sync with the controller: swatches need a selection, reset needs something painted. Unregistering or `unload` removes the group. The controller (`viewer/toolGroupController.ts`) is shared with the mock adapter, so behavior and tests are the same for both.

### Resize flow

The viewer must follow its container when the document tree, dashboard or summary rail opens or closes. `ViewerPane` observes its host element with a `ResizeObserver`, and also listens to `transitionend` on the model page grid and to window `resize`. Events are coalesced with `requestAnimationFrame` and call `adapter.resize()`. The real adapter calls the Autodesk `viewer.resize()` only when the container has a non-zero size. The mock adapter refits its SVG view box. `ViewerPane` also calls `resize()` once after the model loads.

### Theme

`ViewerPane` reads the theme from `useTheme()`, calls `adapter.setTheme` when the adapter is created and whenever the theme changes. See [design-system.md](design-system.md).

`ViewerPane` creates the adapter for a URN, loads the model, shows loading and error states, shows the export status as a badge inside the viewer, publishes the adapter through context and destroys it on unmount. `adapter.contract.test.ts` pins the contract on the mock adapter.

## Extensions

Behavior built on the adapter lives in `src/web/extensions` and `src/web/panels`. See [extensions.md](extensions.md).
