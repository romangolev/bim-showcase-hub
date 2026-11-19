# Layout

The signed-in app is a dock. Every part of the screen is a pane that can be moved, resized, tabbed, collapsed, floated inside the page and, except Documents, closed.

Documents is the main pane. With no model open it shows Home and fills the dock alone. Opening a model adds a viewer tab, plus Model summary and Dashboard (collapsed), and a Models tab beside Documents.

## Documents

The tree of hubs, projects, folders, items and versions, with the shortcuts around it: `src/web/components/tree` and `TreePanel.tsx`.

- The hub menu and, once a hub is chosen, the project menu above the tree choose its root: one hub and one project. The choice is saved in `bsh.pane.docs.root.v1`; a hub or project that disappears falls back to All hubs.
- With no model open the panel shows Home: pinned models, recent models and saved selection sets. The Home menu hides any of the three.
- With a model open, a pinned and recent strip sits above the tree.
- The filter matches loaded nodes only, so expanding more folders widens it. Sort and columns are in the Documents view menu.
- A version row can be dragged onto the dock. The dock highlights while a model is over it, and the drop opens the version in its own tab whatever the open mode is.
- The row menu opens the version, opens it in a new tab, opens it as a modal (a floating viewer pane), adds it to or removes it from the open viewer, pins it, copies its link, reveals its path or shows its versions.

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
| `workspaces.ts` | Built-in presets, saved workspaces, their storage and JSON |
| `WorkspaceSwitcher.tsx` | The top bar Workspaces menu and its save, rename and import dialogs |
| `dockTheme.css` | The `bsh-dock` theme, see [design-system.md](design-system.md#dock-theme) |

Layouts never render pane content. They attach host elements to slots, so React never sees a move. A pane is unmounted only when it is closed. A viewer is destroyed only when its tab closes, when it is paused for the loaded-model budget, or on sign-out.

## Model tabs

The Viewer pane has one instance per open model, a panel `viewer:<urn>` with its own `ViewerPane` and adapter. There is no plain Viewer panel: with no model open there is no viewer group.

- Selecting a version in Documents, a deep link or Back opens a tab, or activates it if open.
- Activating a tab makes its model the active one: summary, dashboard and URL follow.
- Dropping a tab on the edge of the viewer group puts two models side by side.
- Closing the last tab closes the viewer group and its companions, and the URL returns to `/`.
- A combined tab is one panel titled `N models`. Its first URN is the key and the others are in the `with` URL parameter.
- In Documents, Ctrl or Cmd click and Space pick versions and Shift click picks a range. The pick bar offers Open N in viewer (up to 8 models across the open tabs, so it counts the tabs already open), Open together (2 to 6, one combined scene), Add to the open viewer and Clear.
- A single click opens a version according to the Documents open mode, saved with the tree view: a new tab (the default), the active tab, or the active viewer as a combined scene. A combined click adds a model while the tab holds fewer than 6; at 6 it opens a new tab and says so in a toast.
- Replacing closes the active tab. When that tab is a combined scene it closes every model in it, and the tree says how many. The row menu's Open in new tab bypasses the open mode.

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

## Workspaces

The Workspaces menu in the top bar switches the whole arrangement. It lists four built-in presets and the user's saved workspaces.

- **Review**: Documents, viewer, Model summary and a collapsed Dashboard.
- **Data**: the Dashboard and Model summary open, with wider data panes.
- **Present**: the same present mode as the Panes menu and palette, not another arrangement. It needs an open model.
- **Coordination**: Viewer, Models and Model summary; Documents collapsed and charts dismissed.

A preset is a list of pane placements, so it tolerates whichever models are open. Applying any workspace keeps the open models: model tabs are rebuilt in the new arrangement and the viewers are attached again, never reloaded.

Saved workspaces live in `bsh.workspaces.v1` (`{ version: 1, items }`) and are personal: sign-out clears them like the layout. A workspace stores the full arrangement — `dock`, `collapsed`, `treeWidth`, `dismissed`, `lastViewerArrangement` — plus the pane titles and colors it names. Applying a saved workspace restores those titles and colors when it carries any; built-in presets leave them alone. The payload is read through `parseLayout` and `sanitizeDock`, so a corrupt entry or a newer version reads as no workspaces, and one broken entry is dropped without losing the rest. Names are trimmed to 40 characters, at most 20 workspaces are kept, and saving an existing name updates it.

Applying a workspace is undoable once: the previous arrangement is snapshotted and the menu offers **Revert layout**. A full history is not kept.

Limits:

- User-added panes (`chart:2`, `properties:1`, `modelSummary:3`) are not part of a workspace. The instances that exist now are kept and placed by the usual reconciliation.
- Pinned and hidden panes in the Panes menu are a global preference and do not travel with a workspace.
- Applying needs the wide layout and an unlocked layout.
