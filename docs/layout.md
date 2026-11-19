# Layout

The signed-in app is a dock. Every part of the screen is a pane that can be moved, resized, tabbed, collapsed, floated inside the page and, except Documents, closed.

Documents is the main pane. With no model open it fills the dock alone with a hint. Opening a model adds a viewer tab, plus Model summary and Dashboard (collapsed), and a Models tab beside Documents.

## Pieces

Everything lives in `src/web/layout`.

| File | Job |
|---|---|
| `paneRegistry.ts` | `PANES`: every pane and its rules |
| `panes.tsx` | The pane bodies |
| `paneLifecycle.ts` | Pane behavior (instances, open, close, move, collapse, maximize, reset, lock, present) with no React or dockview in it |
| `LayoutProvider.tsx` | Adapts the lifecycle to React: persistence, open-models store, dock or stacked switch, top bar, `useLayout()` |
| `DockLayout.tsx` | The dockview adapter. The only file that imports `dockview-react`. Loaded lazily |
| `StackedLayout.tsx` | The single column below 876 px |
| `ViewerHost.tsx` | `PaneHosts` renders each panel once into a detached element. `PaneSlot` attaches it to a slot |
| `layoutState.ts`, `defaultLayout.ts` | Reducer, serialize and sanitize, the default arrangement |
| `userInstances.ts`, `instanceSettings.ts` | User-added panes and their per-instance settings |
| `PaneMenu.tsx` | Pane header menu and the top bar Panes menu |
| `dockTheme.css` | The `bsh-dock` theme, see [design-system.md](design-system.md#dock-theme) |

Layouts never render pane content. They attach host elements to slots, so React never sees a move. A pane is unmounted only when it is closed. A viewer is destroyed only when its tab closes, when it is paused for the loaded-model budget, or on sign-out.

## Model tabs

The Viewer pane has one instance per open model, a panel `viewer:<urn>` with its own `ViewerPane` and adapter. There is no plain Viewer panel: with no model open there is no viewer group.

- Selecting a version in Documents, a deep link or Back opens a tab, or activates it if open.
- Activating a tab makes its model the active one: summary, dashboard and URL follow.
- Dropping a tab on the edge of the viewer group puts two models side by side.
- Closing the last tab closes the viewer group and its companions, and the URL returns to `/`.
- A combined tab is one panel titled `N models`. Its first URN is the key and the others are in the `with` URL parameter.
- In Documents, Ctrl or Cmd click and Space pick versions and Shift click picks a range. The pick bar offers Open N in viewer (up to 8 loaded models), Open together (2 to 6, one combined scene), Add to the open viewer and Clear.
- A single click opens a version according to the Documents open mode, saved with the tree view: a new tab (the default), the active tab, or the active viewer as a combined scene. A combined click adds a model while the tab holds fewer than 6; at 6 it opens a new tab.

## User pane families

Panes with `instances.source: 'user'` and `creatable: true` can be added many times: `chart`, `modelSummary` and `properties`.

- Each copy is a panel `<kind>:<n>`, such as `chart:1`. At most 12 per kind (`MAX_PER_KIND`).
- Add them from the Panes menu or the palette. This is off when the layout is locked, no model is open, or the layout is stacked.
- The instance list is saved in `bsh.layout.instances.v1`. Each spec is saved in `bsh.pane.<kind>.<n>.v1`. Closing a pane removes its spec.

## Add a pane

1. Write the body in `panes.tsx`. Use `useLayout()` for collapse state and `useViewer()` for the adapter. Use `@container pane (...)` for responsive rules.
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

3. Add the id to the `PaneId` union. To show it in the stacked layout, add it to `STACK_ORDER` in `StackedLayout.tsx`.

The default layout, menus, persistence and stack read the registry.

| Field | Meaning |
|---|---|
| `component` | Body of the plain panel, or `null` for a kind with only instances |
| `instances` | Makes the pane a kind with instances `kind:instance` |
| `defaultPlacement` | `root`, `beside` a reference pane, `tab` in a reference pane's group, or at an `edge`. Sizes are in px |
| `minSize` | Minimum size of the pane's group |
| `closable` | `false` makes the pane required. Only Documents is |
| `canFloat` | Offers Float in the pane menu |
| `requires` | `'viewer'` hides the pane in the stacked layout outside the model route |
| `commands` | Extra palette commands for this pane. `paneCommands` keeps the generated Open/Close and New entries and appends these ([extensions.md](extensions.md#add-a-command)) |

## Persistence

One layout per browser in `localStorage` under `bsh.layout.v2`: `{ version: 2, layout: { dock, collapsed, treeWidth, dismissed, lastViewerArrangement } }`.

- `dock` is dockview's `toJSON()`.
- `collapsed` lists collapsed pane kinds.
- `treeWidth` is the Documents width, clamped to 260 to 480 px.
- `dismissed` lists companions the user closed. They stay closed until reopened or reset.
- `lastViewerArrangement` is where the viewer and companions return when the first model opens again.

A corrupt record or a dock with no known pane falls back to the default layout. Model tabs are reconciled with the open-models store on restore.

Open tabs are in `sessionStorage` under `bsh.models.open`. Sign-out clears them with recent and pinned models. Other keys are in [development.md](development.md#storage-keys).

Reset layout (every pane menu and the Panes menu) rebuilds the default arrangement without remounting any pane. Open models stay open.

## Keyboard and screen readers

Every drag has a menu path.

- Pane menu: Move left, right or below, Float or Dock, Maximize or Restore, Resize with arrow keys, Collapse or Expand, Close, Lock, Reset.
- Maximize (also a double click on a tab) fills the dock. Escape restores. It is not saved.
- Present (Panes menu, palette or Share menu) shows the viewer alone. Arrows and Space step through saved viewpoints and Escape leaves. Present needs an open model (the entries are disabled with a reason otherwise), restores the pane it maximized, and ends when the layout switches between wide and narrow. A Float request waits for its model to attach, per model, and is dropped if that model closes first.
- Lock layout (`bsh.layout.locked`) turns off dragging, floating and closing. It does not apply to the stacked layout.
- Resize mode: arrow keys change size by 16 px (64 px with Shift). Escape, Enter or Tab finish.
- `F6` and `Shift+F6` move focus between pane groups.
- In Documents, `/` focuses the filter and typing letters moves focus to the next matching row. Shift+F10 or the context menu key opens the row menu.
- After a move, focus goes to the moved tab. A live region announces moves, collapse and reset.

## Narrow screens

Below 876 px (`STACKED_QUERY`, `src/web/layout/LayoutProvider.tsx`) the dock is not rendered.

- With no model open, Documents is the main section. With a model open, a tab strip switches models above a column of viewer, dashboard and summary.
- Documents is an overlay from the top bar button.
- The saved dock returns when the window is wide again. User-added panes are not shown.

## Limits

- Floating groups stay inside the page. There are no pop-out windows.
- One layout per browser. No named presets.
- At most 8 models are loaded across all tabs (`MAX_LOADED_MEMBERS`). A combined tab counts every model it holds. Visible tabs are never paused. A paused tab offers Load model.
- A combined tab holds at most 6 models (`MAX_COMBINED_MODELS`).
- All open models must come from one Autodesk region, because the viewer initializes once per page. `viewer/region.ts` records the region. A model from the other region shows an error with Close other models and reload.
