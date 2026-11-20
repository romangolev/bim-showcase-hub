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
| `paneRegistry.ts` | `PANES`: every pane, its catalog text, placement rules and commands |
| `paneAppearance.ts` | Custom pane titles and colour tags |
| `panes.tsx` | The pane bodies |
| `paneLifecycle.ts` | Pane behavior (instances, open, close, move, collapse, maximize, reset, lock, present, workspaces) with no React or dockview in it |
| `LayoutProvider.tsx` | Adapts the lifecycle to React: persistence, open-models store, dock or stacked switch, top bar, `useLayout()` |
| `DockLayout.tsx` | The dockview adapter. The only file that imports `dockview-react`. Loaded lazily |
| `StackedLayout.tsx` | The single column below 876 px |
| `ViewerHost.tsx` | `PaneHosts` renders each panel once into a detached element. `PaneSlot` attaches it to a slot |
| `layoutState.ts`, `defaultLayout.ts` | Reducer, serialize and sanitize, the default arrangement |
| `userInstances.ts`, `instanceSettings.ts` | User-added panes and their per-instance settings |
| `PanesMenu.tsx` | The searchable top bar Panes menu |
| `PaneMenu.tsx` | The pane header menu and the entry builder for the Panes menu footer |
| `layoutApply.ts` | Applying a preset, saved, imported or shared layout, Revert and the active-workspace label, with no React or dockview in it; owns the lock and dock-only wording |
| `workspaces.ts` | Built-in presets, saved workspaces, their storage and JSON |
| `WorkspaceSwitcher.tsx` | The top bar Workspaces menu, its save, rename and import dialogs, Revert and the JSON and share actions |
| `layoutShare.ts` | The `#layout=` share encoding |
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

## Panes menu

The top bar Panes menu is a searchable dialog over every pane.

- The entries sit in a `role="menu"` inside the dialog; the search field stays outside it. A pane toggle and Lock are `menuitemcheckbox` entries with `aria-checked`; the other entries are `menuitem`.
- A row's main action is its command: Open/Close with a checked state for a normal pane, New for a user kind, or a pane hook such as Go to Documents. Focus and the pane's extra commands sit beside it. The footer holds the workspace actions (save, import, download, copy JSON, share link, revert), Present, Lock and Reset layout. A pane with no command, such as the Viewer, has no row.
- Search matches the pane's title, description, category and keywords. Without a query the rows are grouped by category (Workspace, Viewer, Analysis, Data). With a query they become one list.
- Colors (Analysis) and Export (Data) are opt-in viewer followers: they are left out of the companions that follow a model (`opensWithModel: false`) and open from the menu, the palette or an explicit Reset. They are dock panes, not part of the stacked column.

## Rename and colour

The pane header menu has **Rename pane…** and **Color tag…** before the move and collapse entries.

- Rename sets a title of up to 48 characters with whitespace collapsed; an empty title, or Reset title in the dialog, restores the registry title.
- Color tag offers red, orange, yellow, green, blue or purple and shows a dot on the pane's tab; Remove tag clears it.
- Both are keyed by panel id: `summary` for a plain pane, `chart:1` for a copy, so each instance keeps its own and a reopened copy gets its title back. They survive closing the pane and reload, are personal in `bsh.pane.appearance.v1`, and travel with a saved workspace.

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
  description: 'Problems found in the active model.',
  category: 'Analysis',
  keywords: 'errors warnings checks problems',
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
| `description`, `category`, `keywords` | Text the Panes menu shows and searches. `category` is the section heading ("Workspace", "Viewer", "Analysis", "Data" today) |
| `component` | Body of the plain panel, or `null` for a kind with only instances |
| `instances` | Makes the pane a kind with instances `kind:instance` |
| `defaultPlacement` | `root`, `beside` a reference pane, `tab` in a reference pane's group, or at an `edge`. Sizes are in px |
| `minSize` | Minimum size of the pane's group |
| `closable` | `false` makes the pane required. Only Documents is |
| `canFloat` | Offers Float in the pane menu |
| `requires` | `'viewer'` hides the pane in the stacked layout outside the model route |
| `opensWithModel` | Defaults to on. `false` keeps a viewer follower out of the companions until the user opens it |
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

The Workspaces menu in the top bar switches the whole arrangement. It renders only in the dock layout and lists four built-in presets and the user's saved workspaces.

- **Review**: Documents, viewer, Model summary and a collapsed Dashboard.
- **Data**: the Dashboard and Model summary open, with larger data panes.
- **Present**: the same present mode as the Panes menu and palette, not another arrangement. It needs an open model.
- **Coordination**: Viewer, Models and Model summary; Documents collapsed and charts dismissed.

A preset is a list of pane placements, so it tolerates whichever models are open. Applying any workspace keeps the open models: model tabs are rebuilt in the new arrangement and the viewers are attached again, never reloaded. A preset does not touch pane titles or colours.

Saved workspaces live in `bsh.workspaces.v1` (`{ version: 1, items }`) and are personal: sign-out clears them like the layout. A workspace stores the full arrangement — `dock`, `collapsed`, `treeWidth`, `dismissed`, `lastViewerArrangement` — plus the pane appearance map (custom titles and colour tags). Applying a saved or imported workspace replaces the titles and colours when the payload carries any; built-in presets and payloads without appearances leave them alone. The payload is read through `parseLayout` and `sanitizeDock`, so a corrupt entry or a newer version reads as no workspaces, and one broken entry is dropped without losing the rest. Names are trimmed to 40 characters, at most 20 workspaces are kept, and saving an existing name updates it.

Applying a workspace is undoable once: the previous arrangement is snapshotted and the menu offers **Revert layout**. Revert also puts back the titles and colours the workspace replaced. A full history is not kept, and Revert is disabled while the layout is locked.

All apply paths go through `layoutApply.ts`. The lifecycle guard (`applyWorkspace` returns `applied`, `locked` or `dock-only`) is the only check. The module applies the layout first and only then replaces appearances, sets the active label and reports success. A blocked apply says `Unlock the layout first` or `Available in the wide layout`, the same texts the palette and the menu show. The layout snapshot and the appearance snapshot are one undo: Revert restores both and, while locked, neither.

Limits:

- User-added panes (`chart:2`, `properties:1`, `modelSummary:3`) are not part of a workspace: their placement and instance list stay out of it. The instances that exist now are kept and placed by the usual reconciliation. The appearance map can still name an instance id, so applying a workspace that carries one restores that copy's title and colour.
- The switcher exists only in the dock layout, and applying a preset or saved workspace is disabled while the layout is locked.

## Sharing a layout

The Panes menu, the Workspaces menu and the palette can export and import arrangements. There is no server: a layout travels as JSON or in the URL.

- **Download layout** writes `{ kind: 'bsh.workspace', version: 1, name, layout, appearances }` as a slug of the active workspace name, or `layout.json`. **Copy layout JSON** puts the same text on the clipboard.
- **Import layout…** accepts pasted JSON, a chosen file or a dropped file. It validates with `parseLayout` and `sanitizeDock`; invalid JSON, a payload that is not a `bsh.workspace`, another version, and an import while the layout is locked are rejected with a message, and the layout is unchanged.
- **Copy share link** builds `<current URL>#layout=<payload>`. The payload is base64url with `deflate-raw` compression when the browser has `CompressionStream` (prefix `z`) and plain base64url otherwise (prefix `j`). A payload longer than 6,000 characters is not made into a link; the JSON is copied instead and the notice says so.
- The hash is read once at startup, applied like an imported workspace and removed from the URL before it is decoded. Failure and a locked layout therefore drop it with a notice instead of retrying. Later navigation does not re-read it, and a stored layout is replaced only by that one application.

Importing applies the arrangement but does not add it to the saved list; save it from the switcher if it should stay.

## Keyboard and screen readers

Every drag has a menu path.

- Pane menu: Rename pane…, Color tag…, Move left, right or below, Float or Dock, Maximize or Restore, Resize with arrow keys, Collapse or Expand, Close, Lock, Reset. While the layout is locked the menu keeps only Maximize or Restore and Lock or Unlock.
- Panes menu: typing filters, Arrow keys, Home and End move between entries, and Escape closes it and returns focus to the top bar button. Workspaces menu: Arrow keys, Home and End move, Escape closes.
- Maximize (also a double click on a tab) fills the dock. Escape restores. It is not saved.
- Present (Panes menu, palette or Share menu) shows the viewer alone. Arrows and Space step through saved viewpoints and Escape leaves. Present needs an open model (the entries are disabled with a reason otherwise), restores the pane it maximized, and ends when the layout switches between wide and narrow. A Float request waits for its model to attach, per model, and is dropped if that model closes first.
- Lock layout (`bsh.layout.locked`) turns off dragging, floating and closing. It does not apply to the stacked layout.
- Resize mode: arrow keys change size by 16 px (64 px with Shift). Escape, Enter or Tab finish.
- `F6` and `Shift+F6` move focus between pane groups.
- In Documents, `/` focuses the filter and typing letters moves focus to the next matching row. Enter opens the focused version and Space picks it. Shift+F10 or the context menu key opens the row menu.
- After a move, focus goes to the moved tab. A live region announces moves, collapse and reset.

## Narrow screens

Below 876 px (`STACKED_QUERY`, `src/web/layout/LayoutProvider.tsx`) the dock is not rendered.

- With no model open, Documents is the main section. With a model open, a tab strip switches models above a column of viewer, dashboard and summary.
- Documents is an overlay from the top bar button.
- The saved dock returns when the window is wide again. User-added panes are not shown.

## Limits

- Floating groups stay inside the page. There are no pop-out windows.
- One stored layout per browser and no server sync. Named workspaces are local to the browser.
- At most 8 models are loaded across all tabs (`MAX_LOADED_MEMBERS`). A combined tab counts every model it holds. Visible tabs are never paused. A paused tab offers Load model.
- A combined tab holds at most 6 models (`MAX_COMBINED_MODELS`).
- All open models must come from one Autodesk region, because the viewer initializes once per page. `viewer/region.ts` records the region. A model from the other region shows an error with Close other models and reload.
