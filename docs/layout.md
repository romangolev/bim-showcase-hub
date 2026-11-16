# Layout

The signed-in app is a dock: every part of the screen is a pane that can be moved, resized, tabbed, collapsed, floated inside the page and, except for the empty viewer, closed. Every open model is its own viewer tab. The design is in [superpowers/specs/2026-11-16-dockable-layout-design.md](superpowers/specs/2026-11-16-dockable-layout-design.md) and the multi-model plan in [superpowers/plans/2026-11-16-multi-model-plan.md](superpowers/plans/2026-11-16-multi-model-plan.md).

## Pieces

Everything lives in `src/web/layout`.

| File | Job |
|---|---|
| `paneRegistry.ts` | The list of panes (`PANES`), their rules, and panel ids (`parsePanelId`, `paneKind`, `isPanelClosable`) |
| `panelIds.ts` | `instancePanelId(kind, instance)`: the `kind:instance` id of a dynamic pane |
| `panes.tsx` | The pane bodies: tree, the empty viewer (route content), one model tab per open model, summary, dashboard |
| `layoutContext.ts` | `useLayout()` and its types. `paneTitle(id)` returns a panel's label and tooltip: model tabs use the file name and version with the breadcrumb path and URN, summary and dashboard name the active model in their tooltip, everything else uses the registry title |
| `ViewerHost.tsx` | `PaneHosts` renders each open panel once into a detached host `div` with `createPortal`. `PaneSlot` attaches a host to a slot and reports it once it is visible |
| `LayoutProvider.tsx` | State, persistence, reset, the open-models store, the dock or stacked switch, the top bar, `useLayout()` |
| `DockLayout.tsx` | The dockview adapter. The only file that imports `dockview-react`, loaded lazily |
| `StackedLayout.tsx` | The fixed stack below 876px, with the tree as an overlay and a model switcher above the viewer |
| `layoutState.ts` | Reducer, serialize, parse, sanitize, the old key import |
| `defaultLayout.ts` | The default arrangement as ordered steps |
| `PaneMenu.tsx` | The pane header menu, the collapse button and the top bar Panes menu |
| `dockTheme.css` | The `bsh-dock` theme: dockview `--dv-*` variables mapped to our tokens |

Layouts never render pane content. They only attach host elements to slots, so React never sees a move and nothing remounts when a pane is dragged, tabbed, floated, collapsed, or when the window crosses the 876px breakpoint. A pane is unmounted only when it is closed. An Autodesk viewer is never destroyed by a layout change; it is destroyed only when its model tab closes, when it is paused to stay under the loaded-model cap, or when the app signs out.

A panel's portal is rendered only after its host was attached to a visible slot once, so a viewer always starts inside the document and a background tab does not load until it is shown. After every move or tab switch the viewer gets one explicit `adapter.resize()` through `ViewerPane`'s `resizeSignal`, on top of its `ResizeObserver`.

## Model tabs

The Viewer pane has instances: `instances` in its registry entry gives the body (`ModelPaneBody`) and makes them closable. Each open model is a panel `viewer:<urn>` with its own host, `ViewerPane` and adapter. The plain `viewer` panel is the empty viewer; it exists only while no model is open and is replaced in place by the first model tab.

- The tree, a deep link or Back opens a model in a new tab in the active model's group, or activates its tab when it is already open.
- Tabs reorder, split, float and close with the usual dock gestures and pane menu. Dropping a tab on the edge of the viewer group puts two models side by side.
- The tab close button and the pane menu Close remove the model from the open-models store; the dock follows the store (`syncInstances` in `DockLayout.tsx`), so closing the last tab puts the empty viewer back in the same place.
- Activating a tab activates its model: summary, dashboard and the URL follow it.
- The dock adapter knows nothing about models. It receives the wanted instance panel ids, the active one, titles and two callbacks (`onActivateInstance`, `onCloseInstance`).

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
| `instances` | Optional. Makes the pane a kind with instances `kind:instance`, rendered by `instances.component` with an `instance` prop. The plain panel is shown while there are none |
| `defaultPlacement` | `root` (the first pane), `beside` a reference pane (`left`, `right`, `below`) or at an `edge` of the dock, with a size in px. Root comes first, then `beside` in registry order, then `edge`. When a reopened pane's reference is closed it goes to the dock edge in the same direction |
| `minSize` | Minimum width and height of the pane's group |
| `closable` | `false` makes the pane required: no close button, no Close item, re-added if a saved layout lost it |
| `canFloat` | Offers Float in the pane menu |
| `requires` | `'viewer'` hides the pane in the stacked layout outside the model route |

## Persistence

One layout per browser in `localStorage` under `bsh.layout.v2`:

```json
{ "version": 2, "layout": { "dock": { "grid": {}, "panels": {} }, "collapsed": ["summary"], "treeWidth": 320 } }
```

The open model tabs and the active one are in `sessionStorage` under `bsh.models.open`, so a reload restores them and a new browser tab starts with none. Restored tabs load lazily: only the tabs that are visible load at once, the others when they are first shown.

- `dock` is dockview's `toJSON()` output, or `null` before the dock was first shown.
- `collapsed` lists collapsed pane kinds. Collapsing a model tab collapses its group under the `viewer` kind.
- `treeWidth` is used only when the default layout is built.

It is written 300 ms after the last layout change (and at once on `pagehide` and unmount); dock events that serialize to the same JSON are not dispatched at all. On load the record is parsed in a try/catch. A corrupt record, another `version`, or a dock without any known pane falls back to the default layout. Unknown pane ids are dropped from the grid, tabs and floating groups, empty groups and branches are pruned, popout groups are removed, and required panes that are missing are added back at their default position. Model tabs are reconciled with the open-models store when the dock is restored: tabs of models that are no longer open are dropped (the first one becomes the empty viewer when no viewer panel is left, so the arrangement is kept) and open models that are missing are added to the viewer group.

A `bsh.layout.v1` record is migrated once into `bsh.layout.v2` and then deleted: the arrangement, collapse state and tree width are kept and its `viewer` panel becomes the first open model tab, or stays the empty viewer.

On the first run (neither `bsh.layout.v2` nor `bsh.layout.v1`) the old keys are imported once and deleted: `bsh.tree.width` becomes `treeWidth`, `bsh.summary.collapsed=1` collapses the summary, and `bsh.dashboard.collapsed` collapses the dashboard (without a stored choice the dashboard starts collapsed on windows shorter than 900px, as before).

## Reset

Reset layout is in every pane menu and in the top bar Panes menu. It drops the saved dock and rebuilds the default arrangement without remounting any pane. Open models stay open: their tabs go back into one viewer group.

## Keyboard and screen readers

- Every pane header has a collapse button and a menu: Move left, Move right, Move below (to that edge of the dock), Float or Dock, Collapse or Expand, Close (closable panes only), Reset layout. Every drag has a menu path.
- The Panes menu in the top bar reopens closed panes (checkbox items) and resets the layout.
- `F6` and `Shift+F6` move focus between pane groups. Tabs use dockview's `tablist` and roving `tabindex`.
- After a move, focus goes to the moved pane's tab.
- dockview's live region announces open, close, float and dock; the layout's own live region announces moves, collapse and reset. Announcements are muted while a layout is restored or reset.

dockview 8 ships its keyboard navigation and keyboard docking only in the commercial `dockview-enterprise` package, so those are not used; the menus and `F6` are the keyboard path.

## Narrow screens

Below 876px (`STACKED_QUERY`) the dock is not rendered. `StackedLayout` shows main, dashboard and summary in a column with the tree as an overlay (backdrop, `inert` column, Escape and focus return to the top bar button). The saved dock is untouched and comes back when the window is wide again. The layout cannot be customized on narrow screens. With models open, a tab strip (`role="tablist"`, "Open models") above the viewer switches and closes them; only the active model is shown, the others stay mounted in detached hosts.

## Limits

- No pop-out windows, only in-page floating groups.
- One layout per browser, not per model and not synced to the account.
- No named presets.
- At most 4 models are loaded at once (`MAX_LOADED_MODELS` in `api/openModels.ts`). Showing another pauses the least recently shown background model: its adapter is destroyed, its tab stays and offers Load model. This was chosen over a blocking prompt because opening never fails.
- All open models must come from one Autodesk region: the viewer is initialized once per page.
- Window resizes are shared proportionally between groups. Opening, closing, collapsing and expanding keep the other groups' sizes and give the difference to the viewer.

## Testing

- Unit tests (Vitest, jsdom, real dockview with a no-op `ResizeObserver`): `paneRegistry.test.ts`, `layoutState.test.ts`, `defaultLayout.test.ts`, `ViewerHost.test.tsx`, `LayoutProvider.test.tsx`, `StackedLayout.test.tsx`, `menus.test.tsx`, `floating.test.ts`. They assert that `MockViewerAdapter.destroy` is never called and `load` runs once across moves, floating, collapse, reset and the breakpoint switch. `multiModel.test.tsx` covers several models: no duplicate tabs, URL sync, closing destroys only that model, moving and splitting destroy nothing, a failed load stays in its tab, summary switching from the cache, lazy restore after a reload, the loaded-model cap, the debounced write and the stacked switcher. `api/openModels.test.ts` covers the store and `layoutState.test.ts` the v1 migration and model tab reconciliation.
- In mock mode only (`import.meta.env.DEV` and the mock viewer), `window.__bshLayout` exposes `movePane`, `togglePane`, `setCollapsed`, `resetLayout`, `openPanes`, `location`, `mode`, `read`, `models`, `activateModel` and `closeModel`. It is not in a production build.
- `e2e/mock_smoke.py` checks the layout and several models in Camoufox, including real pointer drags of a pane and of a model tab. `e2e/smoke.py --layout` checks the real Autodesk viewer and `e2e/smoke.py --multi` three Revit models at once.
