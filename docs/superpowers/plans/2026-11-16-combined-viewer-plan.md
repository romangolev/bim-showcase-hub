# Combined viewer plan

**Goal:** load several documents (for example the architectural, structural and MEP Revit models of one building, or an NWD plus a Revit model) into one Autodesk Viewer instance and one scene, instead of one viewer per model.

**Builds on:** `2026-11-16-multi-model-plan.md` (one dock tab and one adapter per open model). A combined view is one of those tabs whose adapter holds a model set. Nothing here replaces the per-tab design.

## Findings from the Viewer 7 bundle (7.131.1)

Read from `viewer3D.min.js`, which ships Autodesk's own federation helper `Autodesk.Viewing.AggregatedView`.

- **Loading.** `viewer.loadDocumentNode(doc, node, options)`. Without `keepCurrentModels: true` it tears the viewer down and starts again, so every model after the first needs it. It resolves with the `Model` once the root is loaded. Geometry keeps streaming after that (`model.isLoadDone()`, `GEOMETRY_LOADED_EVENT`, `OBJECT_TREE_CREATED_EVENT`).
- **What AggregatedView passes** to every model: `keepCurrentModels: true`, `applyRefPoint: true`, `globalOffset: <first 3D model's myData.globalOffset>`, `applyScaling: <viewer units>`, `isAEC: true`, `preserveView: true`. It waits for the first 3D model, copies its global offset, then loads the rest with it. That is the reference alignment recipe.
- **`applyRefPoint`.** The loader builds `refPointTransform` from the model's `refPointTransform` (Revit shared coordinates) or from `georeference.refPointLMV` plus `angleToTrueNorth`, and multiplies it into `placementTransform` only when `applyRefPoint` is true. Without it each model sits at its internal origin.
- **`applyScaling`.** A target unit string (or `{ from, to }`). The loader scales from the model's `distance unit` metadata to the target. Without it every model keeps its own unit, so a Revit model in feet and an NWD in metres do not line up. Scaling is applied after the reference point transform, and `globalOffset` is in the final (scaled) world space.
- **`globalOffset`.** Subtracted from every vertex to keep float32 precision. Models must share one offset, otherwise they render shifted by the difference.
- **Selection.** `SELECTION_CHANGED_EVENT` fires only while exactly one model is loaded. With more, only `AGGREGATE_SELECTION_CHANGED_EVENT` fires, with `selections: [{ model, dbIdArray }]`. `viewer.getSelection()` returns the first model's selection and logs a warning; `viewer.getAggregateSelection()` returns `[{ model, selection }]`. `viewer.select(ids, model)` targets one model. dbIds collide across models, so a dbId is never meaningful without its model.
- **Theming.** `viewer.setThemingColor(dbId, color, model, recursive)` and `viewer.clearThemingColors(model)` default to `viewer.model` (the first model) when no model is passed.
- **Visibility and removal.** `viewer.hideModel(model)` removes it from the scene and keeps it in the hidden list; `viewer.showModel(model)` puts it back; `viewer.unloadModel(model)` frees it. `getAllModels()`, `getVisibleModels()`, `getHiddenModels()`.
- **Properties.** Each model has its own property database: `model.getObjectTree(cb)`, `model.getBulkProperties(ids, { propFilter }, cb)`. `viewer.getObjectTree` only covers `viewer.model`.
- **Fit.** `viewer.fitToView()` with no ids fits every visible model.
- **Model Browser** (`Autodesk.ModelStructure`, loaded by `GuiViewer3D`) already lists every loaded model as a root.
- **`Autodesk.ModelAlignment` / `ModelAlignmentService`** exist but read alignment transforms stored by Autodesk Construction Cloud. They do not apply to plain Data Management files, so they are not used.

## Decisions

- **Alignment: shared coordinates, like AggregatedView.** Every model loads with `applyRefPoint: true`. The first model that loads becomes the anchor; its `getData().globalOffset` and its unit (`getUnitString()`) are stored on the adapter and every later model gets `globalOffset` and `applyScaling: <anchor unit>`. Single models use the same options, so adding a model to a single-model tab lines up with it. Removing the anchor keeps the stored offset and unit until the set is empty.
- **Unaligned models are shown, not fixed.** Models without shared coordinates, or from different sites, can end up far apart. The viewer fits the whole set after each load, so they are still visible. There is no manual placement UI. The e2e reports the distance between model centres and warns instead of failing.
- **2D and 3D do not mix.** The geometry node is the document's default geometry, or the first node of the anchor's dimension. A file with no node of that dimension (a DWG with only 2D sheets added to a 3D set) gets a per-model error. Sets of 2D sheets only are allowed.
- **One region.** The Autodesk `Initializer` runs once per page. A model from another region than the first gets a per-model error.
- **Cap.** `MAX_COMBINED_MODELS = 6` in `src/web/viewer/modelSet.ts`. Every model costs geometry and a property database (hundreds of thousands of elements each for the sample Revit files), all in one WebGL context. `addModel` past the cap throws `ModelSetError` with code `limit` and the message "A combined view holds up to 6 models. Remove one to add another."; `loadModels` with more than 6 throws the same before loading anything.
- **Duplicates.** A model id is its urn. Adding an urn that is already in the set throws `ModelSetError` with code `duplicate`; `loadModels` drops repeated urns. A failed model stays listed with its error, does not count toward the cap, and adding its urn again retries it in place.
- **Error isolation.** Each model has a status (`loading`, `ready`, `error`) and an error message. One failing model never stops the others. `loadModels` throws only when every model failed; `load(urn)` still throws when its one model fails, so the single-model error state is unchanged.
- **Progressive loading.** The anchor loads first (its offset is needed), then the others in parallel. Each document manifest is fetched in parallel from the start. Tools mount and the theme applies as soon as the first model is ready.
- **Removing a model** unloads it, drops its selection and paint. Removing a model that is still loading unloads it when its load settles. The adapter keeps the empty viewer; the tab decides to close (stage B).

## Adapter API

`ViewerAdapter` keeps every single-model method. New:

- `loadModels(sources)`, `addModel(source)`, `removeModel(id)`, `getModels()`, `setModelVisible(id, visible)`, `onModelsChange(cb)`. A source is `{ urn, name? }`; a model is `{ id, urn, name, visible, status, error? }` with `id === urn`.
- `getModelSelection(): { modelId, dbId }[]` and `setModelThemingColor(items, color)`. The model-less `getSelection()` and `setThemingColor(ids)` were removed after review; `clearThemingColors()` clears every model. `onSelectionChange` passes `{ modelId, dbId }` pairs for a selection in any model; the real adapter listens to `AGGREGATE_SELECTION_CHANGED_EVENT`.
- `getLeafProperties(names)` returns rows of every ready model, tagged with `modelId` and `modelName` (optional fields on `PropertyRow`).
- Row reads (`sharedLeafRows.ts`) are keyed by the set of ready models, so a model that finishes loading or is removed triggers a fresh read; `useModels(adapter)` and `usePropertyRows` follow the model set.
- Aggregation (`src/web/viewer/modelScope.ts`): `ALL_MODELS` scope, `scopeRows(rows, scope)`, `modelScopeOptions(models)`. Summary and dashboard count the union of rows, so values are summed across models.
- Paint uses `getModelSelection` and `setModelThemingColor`. The Excel export adds a `Model` column when the rows come from more than one model.
- The mock adapter draws every model as its own group, offset so they do not overlap, with model-qualified selection and paint. A urn containing `broken` fails to load, for per-model error tests.
- The real adapter tags its container element with `data-bsh-viewer` and a `bshViewer` property, so e2e scripts reach the right viewer without `NOP_VIEWER`.

## Stage B (after `feat/multi-model` is merged)

- Documents tree: multi-select of viewable versions (Ctrl/Cmd+click, Shift+click, Space), `aria-selected`, an "Open together" action that opens one combined tab titled `N models` with the file list as tooltip, and a row action "Add to open viewer" for the active tab.
- A themed "Models" menu in the viewer tab: visibility toggle, remove, "Add model..." (focuses Documents). Removing the last model closes the tab.
- Summary and dashboard get an "All models / <model>" scope switch on combined tabs.
- URL: `/model/$urn?...&with=<urn2>,<urn3>`. URNs are base64url, so a comma is a safe separator. The first urn stays the path so deep links keep working; `with` lists the rest in order. The URL mirrors the active tab.
- Persistence: the open-models store entry gets the extra urns; restore stays lazy.
- e2e: combined flow in `mock_smoke.py`; `check_combined` in `smoke.py` behind `--combined`.

## Stage B decisions (implemented)

- A combined tab is one open-models entry keyed by its first URN; the others live in `context.with`, so URL, persistence and lazy restore reuse the multi-model machinery. Removing the first model re-keys the tab (the viewer reloads the rest); this is the one case that reloads.
- Opening the first URN again from Documents keeps its members, so the URL is normalized to include `with`.
- Members' names come from the recent-models store (`rememberModel` when picked in Documents); deep links without that history show "Untitled model" for unknown members.
- Picked rows use `aria-checked` because `aria-selected` already marks the open model.
- Visibility is per viewer and not persisted.
- Combined export files are named `<N>-models-properties.xlsx`.
