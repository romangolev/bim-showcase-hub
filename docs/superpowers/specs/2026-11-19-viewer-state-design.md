# Viewer state and viewer actions

Issue #8. The adapter already selects, isolates, hides, shows, takes screenshots and moves the camera per `(modelId, dbId)`. This adds a serializable viewer state, a named `fitToView`, and a `hide` element action.

## Adapter additions

```ts
getState(): ViewerState;
restoreState(state: ViewerState): Promise<void>;
fitToView(items?: readonly ModelDbId[]): void;
```

`fitToView` replaces `fitToSelection`. Without items it fits the whole scene. With items from one model it calls `viewer.fitToView(ids, model, false)` and changes nothing else. With items from several models Autodesk offers no multi-model call, so the adapter selects them and calls `viewer.fitToView()`, which fits the selection.

## State shape

```ts
interface ViewerState {
  version: 1;
  camera: CameraState | null;
  cutplanes: number[][];
  models: Record<string, { isolated: number[]; hidden: number[]; selection: number[] }>;
}
```

Everything is plain JSON. `models` is keyed by model id (the URN), because a `dbId` is only stable within one model version. Only shown, ready models are captured.

## Autodesk filter

`viewer.getState(filter)` and `viewer.restoreState(state, filter, immediate)` take a filter that is "similar in structure to viewerState". The adapter always passes `{ viewport: true, cutplanes: true }`, so renderOptions, autocam and the unfiltered `objectSet` never leak into the state and a Viewer upgrade that adds keys cannot change it. Isolation, hiding and selection are not taken from Autodesk's `objectSet`, which describes one model; they are read per model with `getIsolatedNodes(model)`, `getHiddenNodes(model)` and the aggregate selection, and restored with `isolate`, `hide` and `select`.

## Restore and degrade rules

- Input is sanitized first: anything that is not a version 1 state with the right types restores nothing and never throws.
- Models in the state that are not loaded and shown are skipped. Loaded models missing from the state are reset to fully visible and unselected.
- Per model the adapter reads the object tree and keeps only ids that exist in it. If the tree cannot be read, the model's nodes are left reset. The sentinel `-1` (isolate nothing, used to hide a whole model) is kept.
- An isolation whose ids are all unknown is dropped, because `isolate` with unknown ids would hide everything.
- Reset runs first (`isolate([])` and `show(hidden)`), then isolate, hide, camera, cutplanes and selection.

## Element action

`ELEMENT_ACTIONS` gains `hide` ("Hide"), calling `hideModelIds`. The sanitizer already maps unknown stored values to `select`, so old lists keep working. `zoom` becomes select plus `fitToView(items)`.

## Verification

Autodesk docs (Viewer v7 reference, via context7) confirm: `getState(filter)` returns a plain object with viewport, selection and isolation; `restoreState(viewerState, filter, immediate)` returns a boolean; `fitToView(objectIds, model, immediate)`; `isolate(node, model)`, `hide(node, model)`, `select(dbids, model, selectionType)`, `getIsolatedNodes(model)`. The real Revit sample confirmed the filter result keys (`viewport`, `cutplanes`) in `e2e/state_revit.py`, which runs the adapter's own state functions (`viewerState.ts`) against the real viewer in the export harness. Adapter wiring around them (model ids, aggregate selection, visibility) is covered by the fake federated viewer only.
