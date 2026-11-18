# Layout

The signed-in app is a dock: every part of the screen is a pane that can be moved, resized, tabbed, collapsed, floated inside the page and, except for Documents, closed. Documents is the main pane: it is always there, and on first load or after Reset layout with no model open it fills the dock alone with a "Select a model version to open it in the viewer" hint. The viewer opens from the selected document, and every open model is its own viewer tab. The design is in [superpowers/specs/2026-11-16-dockable-layout-design.md](superpowers/specs/2026-11-16-dockable-layout-design.md).

## Pieces

Everything lives in `src/web/layout`.

| File | Job |
|---|---|
| `paneRegistry.ts` | The list of panes (`PANES`), their rules, and panel ids (`parsePanelId`, `paneKind`, `isPanelClosable`) |
| `panelIds.ts` | `instancePanelId(kind, instance)`: the `kind:instance` id of a dynamic pane |
| `panes.tsx` | The pane bodies: Documents (the tree, plus the route content as a hint while no model is open), one model tab per open model, summary, dashboard |
| `layoutContext.ts` | `useLayout()` and its types. `paneTitle(id)` returns a panel's label and tooltip: model tabs use the file name and version with the breadcrumb path and URN, summary and dashboard name the active model in their tooltip, everything else uses the registry title |
| `ViewerHost.tsx` | `PaneHosts` renders each open panel once into a detached host `div` with `createPortal`. `PaneSlot` attaches a host to a slot and reports it once it is visible |
| `paneLifecycle.ts` | The pane lifecycle as one module with no React or dockview in it (see Pane lifecycle) |
| `userInstances.ts` | The user-made instances of a pane family: ids, titles, the cap, sanitizing |
| `instanceSettings.ts` | The per-instance settings records (chart and model summary specs) and their seed and forget |
| `mounted.ts` | Which attached panels stay mounted for the current mode (`mountedPanels`) |
| `LayoutCommands.tsx`, `layoutCommandList.ts` | The layout's commands for the palette: toggle panes, new chart or summary, go to Documents, present, lock, reset |
| `PresentControls.tsx` | The Present overlay: exit button, viewpoint keys, position indicator and auto-advance |
| `LayoutProvider.tsx` | The adapter between `paneLifecycle` and React: persistence, the open-models store, the dock or stacked switch, the top bar, `useLayout()` |
| `DockLayout.tsx` | The dockview adapter. The only file that imports `dockview-react`, loaded lazily |
| `StackedLayout.tsx` | The fixed stack below 876px, with the tree as an overlay and a model switcher above the viewer |
| `layoutState.ts` | Reducer, serialize, parse, sanitize, the old key import |
| `defaultLayout.ts` | The default arrangement as ordered steps |
| `PaneMenu.tsx` | The pane header menu, the collapse button and the top bar Panes menu |
| `dockTheme.css` | The `bsh-dock` theme: dockview `--dv-*` variables mapped to our tokens |

Layouts never render pane content. They only attach host elements to slots, so React never sees a move and nothing remounts when a pane is dragged, tabbed, floated, collapsed, or when the window crosses the 876px breakpoint. A pane is unmounted only when it is closed. An Autodesk viewer is never destroyed by a layout change; it is destroyed only when its model tab closes, when it is paused to stay under the loaded-model budget, or when the app signs out.

A panel's portal is rendered only after its host was attached to a visible slot once, so a viewer always starts inside the document and a background tab does not load until it is shown. After every move or tab switch the viewer gets one explicit `adapter.resize()` through `ViewerPane`'s `resizeSignal`, on top of its `ResizeObserver`.

## Model tabs

The Viewer pane has instances: `instances` in its registry entry gives the body (`ModelPaneBody`) and makes them closable. Each open model is a panel `viewer:<urn>` with its own host, `ViewerPane` and adapter. The Viewer has no plain panel (`component: null`): with no model open there is no viewer group at all.

- The active group (dockview's `dv-active-group`) gets a 1px inset accent ring drawn by `.dv-active-group::after` in `dockTheme.css`, so nothing shifts. The stacked layout has no active pane, so it has no ring.
- Selecting a viewable version in Documents, a deep link or Back opens the model in a new tab in the active model's group, or activates its tab when it is already open.
- The first model creates the viewer group at its default slot, right of Documents (Documents goes back to its tree width). Summary and dashboard open with it, summary on the right and dashboard below, collapsed, and the Models pane opens as a tab in the Documents group (placement `{ kind: 'tab', reference: 'tree' }`, added inactive so Documents stays the active tab), unless the user closed them before.
- Closing the last model tab closes the viewer group and its companions (summary and dashboard), so Documents is alone again, and the URL returns to `/`.
- Tabs reorder, split, float and close with the usual dock gestures and pane menu. Dropping a tab on the edge of the viewer group puts two models side by side.
- The tab close button and the pane menu Close remove the model from the open-models store; the dock follows the store (`syncInstances` in `DockLayout.tsx`), so it never needs a placeholder.
- Activating a tab activates its model: summary, dashboard and the URL follow it.
- A combined tab is one entry and one panel too: its key is the first model's URN and its context carries the others in `with` (comma separated URNs). The tab is titled `N models` and its tooltip lists the files. Opening the first model again keeps the members; opening a version that is only a member opens it in its own tab. Removing a member updates `with`; removing the first model moves the tab to the next member that has no tab of its own (the panel id changes, so the viewer reloads the remaining models; when one panel leaves and one arrives in the same sync, `syncInstances` adds the new panel to the old panel's group at its tab index before closing the old one, so a floating tab stays floating, a tab alone in a split keeps its split and the tab order stays) and keeps the brought-together offsets and the far-apart distance; when every remaining member already has its own tab, the others are merged into the first member's tab, which becomes active; removing the last one closes the tab. The URL of a combined tab is `/model/<first urn>?...&with=<urn2>,<urn3>`, and `ModelRouteSync` puts `with` back into the URL whenever the store holds members the URL lacks.
- In Documents, Ctrl or Cmd click and Space pick viewable versions (`aria-checked` on the row) and Shift click picks a range. The pick bar offers Open together (2 to 6 versions), Add to the open viewer and Clear. Every viewable row also has an Add to the open viewer button (on hover, focus or when picked) while a viewer tab is active. Only openable versions (view state ready or unknown) can be picked or added: Ctrl or Cmd click and Space on a blocked version show the same notice as a click, a Shift range skips blocked versions and the notice says "Skipped N versions that cannot be opened: <state>", and blocked rows get no add button. The viewer's no-geometry message stays as the fallback for deep links and restored tabs.
- The dock adapter knows nothing about models. It receives the wanted instance panel ids, the active one, titles, the companions to open with the first instance, and callbacks (`onActivateInstance`, `onCloseInstance`, `onClosePane`).

## Pane lifecycle

`paneLifecycle.ts` owns what used to live in refs and effects of `LayoutProvider`: adding and closing instances, opening, closing, toggling, moving, collapsing and maximizing panes, reset, lock, present mode, keyboard resize, the Documents overlay, float-next, which panels are attached, and the announcements. `createPaneLifecycle(deps)` returns commands plus `getState()` and a derived `view()` (instances, user panels, companions, `canAddInstance`, the mounted list). It knows nothing about React or dockview; everything outside reaches it through ports in `deps`: `models` (the open-models store), `dock()` (the `DockController`), `mode()`, `hosts` (release a detached host), `persist` (write the user instances and the lock), `settings` (`seed` and `forget` of an instance's settings), `focus`, `later`, `title` and the `initial` values. `LayoutProvider` builds one lifecycle per mount, subscribes with `useSyncExternalStore`, feeds persisted values back through `sync`, calls `reconcile` and `modeChanged` from effects, and keeps only DOM work: key listeners, focus restore and the debounced layout write. The reducers (`layoutState`, `dockOps`, `userInstances`, `mounted`) stay pure. `paneLifecycle.test.ts` drives it with fakes, without mounting dockview. Design: [pane-lifecycle](superpowers/specs/2026-11-18-pane-lifecycle-design.md).

## User pane families

A pane kind with `instances.source: 'user'` and `creatable: true` can be added more than once. Three exist: `chart` (a Dashboard-style chart), `modelSummary` (a summary table) and `properties` (the property list of the selected elements of one model). Each copy is a panel `<kind>:<n>` (`chart:1`, `modelSummary:2`, `properties:1`), titled `Chart 1`, `Model summary 2`, `Properties 1`, with the lowest free number and at most 12 per kind (`MAX_PER_KIND`). They are added from the Panes menu (`New chart`, `New model summary`, `New properties`) or the palette; adding is off when the layout is locked, no model is open, or the window is narrow (stacked). The list of instances is saved under `bsh.layout.instances.v1`, so the panes come back after a reload and show their empty state ("No charts yet", "No model loaded yet", "No model loaded") while no model is open. The stacked layout does not show user panes. Loading the saved list drops ids that do not belong to their family (`sanitizeUserInstances`), duplicates and anything past the cap. A user pane keeps its place when the first model opens: the remembered viewer arrangement is only adopted into a dock without user panes, so panes placed at home are not rebuilt from an older snapshot.

Each instance has its own spec, saved under `bsh.pane.<kind>.<n>.v1` (`instanceSettingKey`): a chart holds its dashboard view (property, chart kind, maximum categories, PNG options, model and element scope; presets are not used), and a model summary holds `{ scope, elements, properties }`: the model it shows, the element scope and the properties it counts. A new summary is seeded with the active model as its scope. Closing an instance removes its spec. The Dashboard and Model summary panes of the registry are single and keep their own keys (`bsh.dashboard.view.v1`, `bsh.summary.view.v1`, `bsh.summary.properties.v1`, `bsh.summary.scope.v1` and the two click action keys). The summary settings window edits the instance it was opened from. Specs are personal data (the `bsh.pane.` prefix is registered), so sign-out clears them. Design: [pane-families](superpowers/specs/2026-11-18-pane-families-design.md) and [pane-families-2](superpowers/specs/2026-11-18-pane-families-2-design.md).

## Pinned and Recent

Above the tree, `RecentStrip` lists Pinned models and the most recent ones from `bsh.models.recent` (Settings, Documents sets how many, default 5, 0 hides them). It is collapsed to a one-line header, "Pinned and Recent (N)", and expands as an overlay on the tree (no reflow) on mouse hover, when focus enters it, or when the header button is clicked or tapped (`aria-expanded`); it collapses about 150 ms after the pointer or focus leaves. Touch has no hover, so the header button is the way in there. The star on a row pins or unpins a model; pins are model URNs in `bsh.docs.pinned`, shown with the stored file name and version, or "Untitled model" when the recents no longer hold the model. Clicking a row opens the model with its stored breadcrumb context. Folders cannot be pinned and pins are not reorderable yet.

Rows in the strip and version rows in the Documents tree have a context menu: Open, Open as modal (opens the model and floats its pane), Add to open model or Remove from open model (the item follows whether the model is in the active viewer tab; at 6 models Add is disabled with the reason), and Pin or Unpin. It opens on right click, Shift+F10 or the ContextMenu key, a 500 ms touch long press, and the kebab button on strip rows; Escape returns focus to the row. A row already in the open viewer shows a small dot and, on hover or focus, an x button that removes it. Folders have no menu.

## Tree metadata and sort

`TreeNode` has optional `modifiedAt`, `modifiedBy` and `size`. The server maps them from the Data Management attributes `lastModifiedTime`, `lastModifiedUserName` (folders, items and versions) and `storageSize` (versions); a value that is missing or unusable is left out. The search row of Documents has a view menu: sort by name (natural order, folders first) or by modified (newest first, undated last), and Show modified, author and size. The choice is stored in `bsh.tree.view` and applies to folder contents; hubs, projects and versions keep the server order. Rows show the enabled columns as one trailing line, hidden when the tree is narrower than 300px. Versions already show date and author, so for them only size is added. These attribute names come from the Data Management reference and have not been checked against a real account here.

## Add a pane

1. Write the body in `panes.tsx` (or its own file). Use `useLayout()` for collapse state and `useViewer()` for the adapter. Give the body one root element; the slot around it is a `pane` size container, so use `@container pane (...)` for responsive rules.
2. Add an entry to `PANES` in `paneRegistry.ts`:

```ts
{
  id: 'issues',
  title: 'Issues',
  icon: 'alert',
  component: IssuesPane,
  minSize: { width: 280, height: 160 },
  defaultPlacement: { kind: 'beside', reference: 'summary', direction: 'below', size: 240 },
  closable: true,
  canFloat: true,
  requires: 'viewer',
}
```

3. Add the id to the `PaneId` union. If it should appear in the stacked layout, add it to `STACK_ORDER` in `StackedLayout.tsx`.
4. Nothing else changes: the default layout, the menus, the Panes menu, persistence and the stack read the registry.

Fields:

| Field | Meaning |
|---|---|
| `instances` | Optional. Makes the pane a kind with instances `kind:instance`, rendered by `instances.component` with an `instance` prop. Panes listed with `requires` equal to this kind open with its first instance and close with its last |
| `component` | The body of the plain panel, or `null` for a kind that only has instances |
| `defaultPlacement` | `root` (the first pane), `beside` a reference pane (`left`, `right`, `below`) or at an `edge` of the dock, with a size in px. Root comes first, then `beside` in registry order, then `edge`. When a reopened pane's reference is closed it goes to the dock edge in the same direction |
| `minSize` | Minimum width and height of the pane's group |
| `closable` | `false` makes the pane required: no close button, no Close item, re-added if a saved layout lost it. Only Documents is required |
| `canFloat` | Offers Float in the pane menu |
| `requires` | `'viewer'` hides the pane in the stacked layout outside the model route |

## Persistence

One layout per browser in `localStorage` under `bsh.layout.v2`:

```json
{ "version": 2, "layout": { "dock": { "grid": {}, "panels": {} }, "collapsed": ["dashboard"], "treeWidth": 320, "dismissed": ["summary"], "lastViewerArrangement": { "grid": {}, "panels": {} } } }
```

The open model tabs (with their `with` members, any brought-together offsets and the far-apart distance) and the active one are in `sessionStorage` under `bsh.models.open`, so a reload restores them and a new browser tab starts with none. Sign-out clears them together with the recent-models store (`bsh.models.recent`, which holds file names) and the Pinned list (`bsh.docs.pinned`, URNs); the owner is kept in `bsh.models.owner` as `id:<user id>` (a hash of the Autodesk `sub` that `/api/session` returns as `id`), or `name:<display name>` only when the session has no id, and a different owner clears both on sign-in, so two accounts with the same display name never share tabs. An owner stored by name (a bare name from older versions, or `name:`) is upgraded to the id on the first sign-in that has one: the same name keeps the data, a different name clears it. Restored tabs load lazily: only the tabs that are visible load at once, the others when they are first shown.

- `dock` is dockview's `toJSON()` output, or `null` before the dock was first shown.
- `collapsed` lists collapsed pane kinds. Collapsing a model tab collapses its group under the `viewer` kind.
- `treeWidth` is the Documents width the user last left while it shared the dock (measured on every dock change, clamped to 260 to 480 px, 320 px until the user resizes). It is used when the default layout is built and when the first model opens next to Documents.
- `lastViewerArrangement` is the last dock that had a model tab, captured once when the last model tab closes (not on every change, so the record does not hold the dock twice while models are open). When the first model opens again (after the last one closed, or in a new browser tab whose session has no open models), the dock is rebuilt from it: the new model tabs take the old viewer group's place and the companions go back where they were, minus the ones in `dismissed`. Reset layout clears it. Older records derive it from their dock.
- `dismissed` lists the companions the user closed (tab close button, pane menu Close or the Panes menu). They stay closed when later models open; reopening one from the Panes menu or Reset layout clears it. Closing companions because the last model closed does not count. Older records without the field read as none dismissed. Models used to start dismissed: a saved layout keeps that (its `dismissed` still lists `models`) until Reset layout, while new layouts, layouts that never held the field and Reset get the Models tab beside Documents.

It is written 300 ms after the last layout change (and at once on `pagehide` and unmount); dock events that serialize to the same JSON are not dispatched at all. On load the record is parsed in a try/catch. Sanitizing keeps the grid consistent: when panes are dropped their siblings share the freed space, a branch left with one child is replaced by that child (or its children spliced into the grandparent, flipping the root orientation when needed). If dockview still rejects the restored dock, each optional panel is dropped in turn until it loads, and only then does the default layout take over. A corrupt record, another `version`, or a dock without any known pane falls back to the default layout. Unknown pane ids are dropped from the grid, tabs and floating groups, empty groups and branches are pruned, popout groups are removed, and required panes that are missing are added back at their default position. Model tabs are reconciled with the open-models store when the dock is restored: tabs of models that are no longer open are dropped and open models that are missing are added to the viewer group, or at the viewer's default slot when there is none. With no model open the companions are closed too. The empty `viewer` panel of earlier v2 records is dropped, which reads as "no model open".

A `bsh.layout.v1` record is migrated once into `bsh.layout.v2` and then deleted: the arrangement, collapse state and tree width are kept and its `viewer` panel becomes the first open model tab, or is dropped when no model is open.

On the first run (neither `bsh.layout.v2` nor `bsh.layout.v1`) the old keys are imported once and deleted: `bsh.tree.width` becomes `treeWidth`, `bsh.summary.collapsed=1` collapses the summary, and the dashboard starts collapsed unless `bsh.dashboard.collapsed=0` was stored.

## Reset

Reset layout is in every pane menu and in the top bar Panes menu; its tooltip says "Resets the arrangement. Open models stay open; remembered viewer position and closed panes are cleared." Open models stay open, but Reset also clears `lastViewerArrangement` (where the viewer and its companions go back when the first model opens again) and `dismissed` (the companions the user closed, which come back). It drops the saved dock and rebuilds the default arrangement without remounting any pane: Documents alone when no model is open, otherwise Documents with the Models tab beside it, the viewer with all open model tabs in one group, summary and dashboard (collapsed).

## Keyboard and screen readers

- Every pane header has a collapse button and a menu: Move left, Move right, Move below (to that edge of the dock), Float or Dock, Maximize or Restore, Resize with arrow keys, Collapse or Expand, Close (closable panes only), Lock or Unlock layout, Reset layout. Every drag has a menu path.
- Maximize (also a double-click on a tab) makes the pane's group fill the dock; Escape or Restore brings the arrangement back. The maximized state is not saved.
- Present (Panes menu, palette, or Present in the viewer's Share menu, which is the entry on the stacked layout) hides the chrome and shows the viewer alone (`data-presenting` on `<html>`). ArrowRight and Space go to the next viewpoint, ArrowLeft to the previous, with a discreet `n / total` indicator that a live region also announces; Escape or the exit button leaves. Settings has an optional auto-advance interval (off by default). The lifecycle remembers a pane that was maximized before Present and maximizes it again on exit; a viewer the user had already maximized stays maximized. Design: [snapshots-viewpoints-present](superpowers/specs/2026-11-19-snapshots-viewpoints-present-design.md).
- Lock layout (also in the Panes menu, stored in `localStorage` as `bsh.layout.locked`) turns off dragging and floating, hides tab close buttons and leaves only Maximize and Unlock in the pane menu; Panes toggles, Reset layout and keyboard resize are disabled. It does not apply to the stacked layout.
- Resize with arrow keys enters a resize mode for that pane: Left and Right change its width, Up and Down its height, by 16 px (64 px with Shift); Escape, Enter or Tab finish. The live region announces the mode, each new size and the end. Floating groups are resized with their own handles.
- The Panes menu in the top bar lists the optional panes (Model summary, Dashboard, Models) as checkbox items, offers New chart and New model summary, and resets the layout. Opening one without a model shows its "No model loaded yet" state. Documents is not listed because it cannot close, and model tabs open from Documents.
- The top bar Documents button collapses or expands the Documents pane in the dock.
- `F6` and `Shift+F6` move focus between pane groups from anywhere in the page, including the top bar, except while typing in a field or inside the viewer canvas. Tabs use dockview's `tablist` and roving `tabindex`.
- After a move, focus goes to the moved pane's tab.
- dockview's live region announces open, close, float and dock; the layout's own live region announces moves, collapse and reset. Announcements are muted while a layout is restored or reset.

dockview 8 ships its keyboard navigation and keyboard docking only in the commercial `dockview-enterprise` package, so those are not used; the menus and `F6` are the keyboard path.

## Narrow screens

Below 876px (`STACKED_QUERY`) the dock is not rendered. With no model open, `StackedLayout` shows Documents as the main section with the hint. Selecting a model switches to the viewer section: the model switcher, the viewer, dashboard and summary in a column, with Documents as an overlay from the top bar button (backdrop, `inert` column, Escape and focus return to the button). That button is the way back to Documents; closing the last model in the switcher shows Documents again. The saved dock is untouched and comes back when the window is wide again. The layout cannot be customized on narrow screens. With models open, a tab strip (`role="tablist"`, "Open models") above the viewer switches them: the tabs are the tablist's direct children with `aria-selected` and `aria-controls` pointing at the viewer `tabpanel`, Left, Right, Home and End move and activate, Delete closes the focused tab, and a Close button next to the strip closes the active model. Only the active model is shown, the others stay mounted in detached hosts. Panes the stack does not show (summary and dashboard off a model) are not rendered at all.

## Limits

- No pop-out windows, only in-page floating groups.
- One layout per browser, not per model and not synced to the account.
- No named presets.
- At most 8 models are loaded at once across all tabs (`MAX_LOADED_MEMBERS` in `src/shared/combined.ts`); a combined tab counts every model it holds. A tab that is visible in any group is never paused, so a split can go over the budget, and a single tab larger than the budget alone still loads. Showing another tab, or adding a member to a loaded one, pauses the least recently shown hidden tabs until the total fits, and a model that becomes active (by closing the active tab, for example) is loaded at once. A paused model has its adapter destroyed; its tab stays and offers Load model. This was chosen over a blocking prompt because opening never fails.
- All open models must come from one Autodesk region: the viewer is initialized once per page. The region is claimed in `viewer/region.ts` only when the Autodesk `Initializer` runs (the mock adapter claims it when its first model loads), so a first load that fails earlier, for example when the viewer script cannot load, leaves the page free for either region; `region.ts` is the only record of it. A tab from the other region is detected from its URN before any viewer is created, and a conflict found during startup shows the same message and shows "This model is in the EU region. The viewer supports one region per page." with Close other models and reload, which keeps only that tab and reloads; it never creates a viewer that would fail.
- A combined tab holds at most 6 models (`MAX_COMBINED_MODELS`) and counts each of them toward the loaded budget of 8; its paused state says how many models it holds. Its members must come from the page's region; a member from the other region fails on its own with a message, the rest load.
- Window resizes are shared proportionally between groups. Opening, closing, collapsing and expanding keep the other groups' sizes and give the difference to the viewer.

## Testing

- Unit tests (Vitest, jsdom, real dockview with a no-op `ResizeObserver`): `paneRegistry.test.ts`, `layoutState.test.ts`, `defaultLayout.test.ts`, `ViewerHost.test.tsx`, `LayoutProvider.test.tsx`, `StackedLayout.test.tsx`, `menus.test.tsx`, `floating.test.ts`. They assert that `MockViewerAdapter.destroy` is never called and `load` runs once across moves, floating, collapse, reset and the breakpoint switch. `multiModel.test.tsx` covers several models: no duplicate tabs, URL sync, closing destroys only that model, moving and splitting destroy nothing, a failed load stays in its tab, summary switching from the cache, lazy restore after a reload, the loaded-model budget (combined tabs count every member), the debounced write and the stacked switcher, and the Documents-first rules: Documents has no Close, closing the last model leaves Documents alone, a closed companion stays closed until it is reopened or the layout is reset, and the narrow-screen path from Documents to the viewer and back. `api/openModels.test.ts` covers the store and `layoutState.test.ts` the v1 migration and model tab reconciliation.
- In mock mode only (`import.meta.env.DEV` and the mock viewer), `window.__bshLayout` exposes `movePane`, `togglePane`, `setCollapsed`, `resetLayout`, `openPanes`, `location`, `mode`, `read`, `models`, `activateModel` and `closeModel`. It is not in a production build.
- `e2e/mock_smoke.py` checks the Documents-only start, the layout and several models in Camoufox, including real pointer drags of a pane and of a model tab. `e2e/smoke.py --layout` checks the real Autodesk viewer and `e2e/smoke.py --multi` three Revit models at once.

## Models pane state

In the Models pane each ready row's Isolate button reads the real model visibility (`isolatedModel` in `panels/modelRows.ts`): when that row is the only visible model it shows "Show all" (accessible name "Show all models"), is `aria-pressed` with a blue border, and clicking it shows every model again. Because the state is derived from the viewer, hiding through the eye buttons, the models menu or the share-link restore flips it too. Element isolation (summary rows, chart clicks, the toolbar) is separate and does not change it.

Per-model visibility is remembered in `localStorage` under `bsh.models.hidden` (`useModelVisibilityMemory`, called from `ViewerPane`): a flat list of the URNs of hidden models, capped at the 200 most recent. A model in the list opens hidden; on every later change the entries for the models that are open are replaced by their current hidden state, and entries for models that are not open are kept. It only applies while two or more models are open. It is restored once per adapter and model set when no model is still loading, and written on every later change. It applies in the stacked layout too, which has no Models pane.
