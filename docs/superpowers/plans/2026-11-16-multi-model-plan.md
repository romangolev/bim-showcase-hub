# Multi-model viewer plan

**Goal:** the viewer area opens several models at once. Each open model is its own dock tab with its own `ViewerPane` and adapter. Tabs can be reordered, split side by side, floated and closed with the existing dock machinery. Summary, dashboard and the tool group follow the active model.

**Builds on:** `docs/superpowers/specs/2026-11-16-dockable-layout-design.md` and `docs/layout.md`.

## Decisions

- **Dynamic panes.** `paneRegistry.ts` gets pane kinds with instances. The `viewer` kind has instances `viewer:<urn>`, one per open model, rendered by `ModelPaneBody`. The plain `viewer` panel is the placeholder that holds the empty state; it exists only while no model is open. `paneKind(panelId)` maps any panel id to its registry entry, so the dock, menus, collapse and persistence work on kinds and never hard-code model tabs.
- **One host per model.** Each model panel gets its own detached host and portal, so moving, tabbing, floating or splitting never remounts it. Closing the tab unmounts the portal and destroys only that adapter.
- **Open-models store** (`src/web/api/openModels.ts`): `models` (urn plus its `file`, `v`, `crumbs`, `trail`), `active`, and `live` (loaded models, least recently shown first). Opening an open urn activates it, so there are never duplicates. Closing the active tab activates the right neighbour, else the left one. Persisted in `sessionStorage` under `bsh.models.open` (models and active only), so a reload restores the tabs and a new browser tab starts clean.
- **Lazy loading.** A model loads only when its tab is first shown (active tab, or the visible tab of another group in a split). Restored background tabs stay unloaded until shown.
- **Loaded cap.** `MAX_LOADED_MODELS = 4`. Showing a fifth model suspends the least recently shown other loaded model: its adapter is destroyed, its tab stays, and it shows "Paused to save memory" with a Load button; showing it again reloads it. Chosen over an inline prompt because it never blocks opening.
- **URL sync.** The tree still navigates to `/model/$urn` with its search params. A route sync in `LayoutProvider` opens or activates that urn. When the active tab changes, the URL is replaced with the active model and its stored search params. Closing the last tab navigates to `/`. On `/` with open tabs, the URL is replaced with the active model.
- **Active viewer.** `ViewerProvider` keeps a map of urn to adapter. `ViewerPane` publishes its adapter under its urn and provides it to its own subtree. Outside a pane, `useViewer()` returns the active model's adapter, so summary and dashboard follow the active tab. `sharedLeafRows.ts` keeps the last read per adapter, so switching back does not re-read; Refresh forgets it.
- **Adapter safety.** `RealViewerAdapter` calls `tearDown`/`finish` only for a viewer whose `start()` succeeded, at most once, and wraps listener callbacks so an exception never escapes into the shared render loop. A failed load leaves an error state in that tab only.
- **Persistence v2.** `bsh.layout.v2`, `{ version: 2, layout }`. v1 is migrated once: its arrangement is kept and its `viewer` panel becomes the first open model tab, or stays the placeholder. Restore reconciles the dock with the open models: stale model panels are dropped (the first one becomes the placeholder if no viewer panel is left) and open models missing from the dock are added to the viewer group. Reset layout keeps the open models.
- **Write debounce.** Dock changes that serialize to the same JSON are not dispatched. The storage write is debounced (300 ms) and flushed on `pagehide` and unmount.
- **Stacked layout.** A tab strip of open models sits above the single visible viewer. Hosts of the other models stay mounted but detached.
- **Limits.** One Autodesk region per page (the `Initializer` runs once); models from another region need a reload.

## Phases

1. Plan (this file).
2. Open-models store, per-adapter row cache, adapter safety, mock rows vary by urn. Unit tests.
3. Layout: dynamic panes, model tabs, active viewer, URL sync, persistence v2 with migration, debounce, stacked switcher. Unit tests.
4. e2e: `mock_smoke.py` multi-model checks, `smoke.py --multi`, `E2E_HEADLESS`. Docs.
5. Documents-first layout (below).

## Phase 5: Documents first

Requested after phases 1 to 4: "Documents should be the main panel, other ones should be optional. Viewer opens from the selected document."

- Documents is the only required pane: not closable, always re-added by reset, migration and sanitize. Viewer tabs, summary and dashboard are optional and closable.
- Default layout is Documents alone with an empty hint. No placeholder viewer.
- Selecting a viewable version (or a deep link) opens the viewer group right of Documents if it is not open, with a new model tab. Closing the last model tab closes the viewer group and returns to `/`.
- Summary and dashboard open next to the viewer when the first model opens (summary right, dashboard below and collapsed), unless the user closed them before. That choice is persisted per pane and cleared by Reset layout. With no model open they stay listed in the Panes menu and show their "no model" empty state.
- Schema v3 with a migration from v1 and v2: arrangement kept, Documents required, a missing viewer means no model open.
- Stacked: Documents is the primary section; the viewer section appears after a model is selected, with a way back to Documents.
