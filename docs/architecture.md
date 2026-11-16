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

- **Router** (`routes/router.tsx`): a root route renders `AppShell`, an index route renders `EmptyState`, and `/model/$urn` renders the lazily loaded `ModelPage` (the model header). Search parameters (`file`, `v`, `crumbs`, `trail`) are validated by `parseModelContext`. They carry the file name, version label and tree path from the tree to the page.
- **Query** (`api/hooks.ts`, `queryClient.ts`): the session query (`['session']`, no retry) decides between the landing page and the app. Each tree node's children are a query keyed by `scopeKey`, with a 5 minute stale time. Sign-out removes the children queries and clears the session. Sign-in fetches the authorize URL and assigns `window.location`.
- **Table** (`panels/SummaryTable.tsx`): renders the model summary.
- **Virtual** (`components/tree/DocumentTree.tsx`): virtualizes tree rows.

### Tree

`components/tree/DocumentTree.tsx` uses `@headless-tree/core` with the async data loader feature. Rows are loaded on expand through the children queries and rendered by `TreeRowView` with `role="treeitem"`, `aria-level`, `aria-expanded` and, for openable versions, `data-viewable`. `api/scope.ts` maps a node and its ancestors to the right endpoint (`childrenPath`). Only versions with a URN open the model route. `TreePanel` adds the filter box. It is the Documents pane of the layout: resized with the dock sash on wide screens and shown as an overlay below 876 px.

### Layout

`AppShell` handles the session and the skip link. When signed in it lazily loads `LayoutProvider` (`src/web/layout`), which renders the top bar and the panes. Each pane comes from the registry in `paneRegistry.ts` (Documents, Viewer, Model summary, Dashboard) and is rendered once into a detached host element through a React portal; a layout only attaches those hosts to its slots. From 876 px wide the dock (`DockLayout.tsx`, built on `dockview-react`, lazy loaded) arranges the panes and lets the user move, tab, float, collapse and close them; below that `StackedLayout.tsx` shows a fixed column with the tree as an overlay. The arrangement is saved in `localStorage` under `bsh.layout.v1`. See [layout.md](layout.md).

`ViewerProvider` sits in `LayoutProvider`, so every pane can reach the adapter through `useViewer()`.

### Model page

The Viewer pane is the main pane: `<main id="main">` holds the route content (the model header from `ModelPage`, the empty state or not found) and, on `/model/$urn`, the `ViewerPane` for the URN read from the router. `ModelPage` shows the header (breadcrumb, title, URN) and sets the document title. Paint and export are not in a page toolbar: they live in the viewer toolbar as a tool group. The summary and the dashboard are their own panes. Panes read the active adapter from the viewer context and fetch property rows through `usePropertyRows`. Collapse state lives in the layout record (`collapsed`); in the dock it shrinks the pane's group to its header, in the stack the panels' own toggles show it.

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

- **RealViewerAdapter** loads the Autodesk Viewer 7.* script and style from `developer.api.autodesk.com`, initializes it once per page with a `getAccessToken` callback that calls `/api/viewer/token` (concurrent loads share one `Initializer` call, and a 401 from the token route marks the session as signed out), picks the `derivativeV2_EU` API when the decoded URN contains `emea` and `derivativeV2` otherwise, and starts a `GuiViewer3D`. The Autodesk Viewer cannot be initialized twice, so opening a model from the other region after the page was initialized rejects with a clear error and asks for a page reload. Property rows come from `getBulkProperties` over the leaf nodes of the object tree. `setTheme` applies the viewer's `dark-theme` or `light-theme` and sets the scene background from the `--color-graphite` and `--color-void` tokens (`sceneBackground.ts`). It is applied at start, again after the model loads, and on every theme change.
- **MockViewerAdapter** draws a fixture building as SVG labeled "Mock building model", supports selection by click, theming colors, a fake toolbar with the same tool group, a `data-viewer-theme` attribute for the theme, and generated property rows from `mockModel.ts`. Outside tests it adds a large synthetic set of rows (104,000) so export and summary behave with a realistic size.

### Autodesk tool group

The real adapter mounts the tool group as an Autodesk Viewer extension, `BimShowcaseHub.Tools` (`viewer/autodeskTools.ts`). Once the model has loaded and a group is registered, the adapter loads the extension with a `ToolGroupController` as its option. The extension adds a control group to the native viewer toolbar with a paint combo button (red, green, blue and reset) and an export button, and keeps their enabled states in sync with the controller: swatches need a selection, reset needs something painted. Unregistering or `unload` removes the group. The controller (`viewer/toolGroupController.ts`) is shared with the mock adapter, so behavior and tests are the same for both.

### Resize flow

The viewer must follow its container when panes move, open, close, collapse or float, and when the window crosses the breakpoint. `ViewerPane` observes its host element with a `ResizeObserver` and listens to window `resize`. Events are coalesced with `requestAnimationFrame` and call `adapter.resize()`. A trailing timer re-calls `resize()` 250 ms after the last event so the viewer sees the final layout. The layout also bumps a `resizeSignal` prop whenever the viewer's host is attached to a new slot or dockview moves the viewer pane, and `ViewerPane` then calls `adapter.resize()` once. The real adapter calls the Autodesk `viewer.resize()` only when the container has a non-zero size; it first clears any fixed pixel width or height on the viewer element, and if the render canvas still differs from the container afterwards it calls `viewer.impl.resize(width, height)` directly. The mock adapter refits its SVG view box. `ViewerPane` also calls `resize()` once after the model loads.

Moving the viewer never recreates it: the layout moves the host element, not the React tree, so the adapter and its WebGL canvas survive moves, tabs, floating groups and the breakpoint switch.

Full screen. The native toolbar button (`#toolbar-fullscreenTool`) calls `viewer.nextScreenMode()`. The default Autodesk delegate supports only normal and full screen: it adds `viewer-fill-browser` to the viewer's own `.adsk-viewing-viewer` element (`viewer.container`, a child of our host) and calls the browser Fullscreen API `requestFullscreen()` on it. It then calls `viewer.resize()` synchronously, before the request has taken effect, and fires `FULLSCREEN_MODE_EVENT`. Our host keeps its size, so the host `ResizeObserver` does not fire. Autodesk only resizes again from its own `fullscreenchange` listener, and only while entering; on exit through the button it resizes while still in full screen. So the real adapter sizes from the measured frame: the fullscreen element when it lies inside the host, otherwise the host. It never forces the canvas back to the host size while the viewer is in full screen. It listens to `fullscreenchange` and `webkitfullscreenchange` (resize now, then once per animation frame and again 400 ms later), to `FULLSCREEN_MODE_EVENT`, and observes `viewer.container` with a `ResizeObserver`, so the end of the browser's full-screen transition also resizes. On `fullscreenerror` it removes a leftover `viewer-fill-browser` class, which would otherwise pin the viewer with `position: fixed`. Esc, the button and the browser's own exit all end in `fullscreenchange`, so the host size comes back without reloading the model. Leaving the DOM exits full screen, so this works wherever the host is mounted. Our own overlays and panels sit outside the fullscreen element and are hidden while it is in full screen; the Autodesk docking panels, toolbar and ViewCube live inside it and follow the canvas.

### Theme

`ViewerPane` reads the theme from `useTheme()`, calls `adapter.setTheme` when the adapter is created and whenever the theme changes. See [design-system.md](design-system.md).

`ViewerPane` creates the adapter for a URN, loads the model, shows loading and error states, shows the export status as a badge inside the viewer, publishes the adapter through context and destroys it on unmount. `adapter.contract.test.ts` pins the contract on the mock adapter.

## Extensions

Behavior built on the adapter lives in `src/web/extensions` and `src/web/panels`. See [extensions.md](extensions.md).
