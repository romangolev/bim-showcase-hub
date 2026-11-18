# Viewer adapter cluster

## Intent

`ViewerAdapter` has about 45 methods and two big implementations: `RealViewerAdapter` (Autodesk viewer, 1222 lines) and `MockViewerAdapter` (SVG scene, 1074 lines). A model-set change touches the interface, both adapters and `fakeFederatedViewer.ts`. Property-row shaping, spread and offset bookkeeping, and selection fan-out are written twice and drift apart.

The goal is to move the behaviour that is identical in both adapters into small deep modules, each over a tiny port that only the viewer-specific part implements. `ViewerAdapter` stays the facade that callers use, with the same method names and behaviour.

## Goals

- One implementation of property-row aggregation (shown-model filter, progress sum, per-model failure, `propertiesError` bookkeeping, tagging, merge of discovery lists).
- One implementation of placement bookkeeping (offset store, spread, together offsets, "together" flag) over a box and apply port.
- One implementation of selection listener fan-out.
- Each module is tested through its interface with a stub port, and the existing contract tests keep running against the mock adapter and the real adapter on the fake federated viewer.
- Every commit is green.

## Non-goals

- No change to the `ViewerAdapter` interface, to `ViewerPane`, tools, panels, `sharedLeafRows`, `propertyScope` or the Excel read path.
- No change to Autodesk viewer calls, their order, or to the mock DOM output.
- No new seam where only one thing varies.

## Sketch A: collaborator modules, one small port each

```
ViewerAdapter (facade, unchanged)
  RealViewerAdapter / MockViewerAdapter    own lifecycle, tools, camera, theme, native element state
    PropertyReader(models, PropertySource)     rows(), infos()
    Placement(models, PlacementPort)           spread(), together(), set(), offsetOf()
    SelectionHub                               subscribe(), emit(items)
    ModelSet (existing)                        ids, visibility, tokens
```

Ports: `PropertySource { rows(handle, info, names, options), infos(handle, info, options) }`, `PlacementPort { boxOf(info, handle), apply(info, handle, offset), anchorId(), unitMeters() }`.

## Sketch B: one ViewerCore over a wide engine port

```
ViewerAdapter (facade) = ViewerCore
  ViewerCore owns ModelSet, offsets, selection, isolation, hiding, reads
  ViewerEngine (port): load, unload, place, show/hide model, select, isolate, hide, rows, infos, box, theme, camera, tools, screenshot ...
    AutodeskEngine / MockSvgEngine
```

## Choice

Sketch A.

- Sketch B's engine port ends up about as wide as `ViewerAdapter` itself, so the core is shallow and the engine adapters keep nearly all the code. It also forces one state model for selection and isolation, but Autodesk owns that state natively (`viewer.isolate`, `getAggregateSelection`) while the mock keeps sets. A shared store would duplicate native state and risk drift.
- Sketch A passes the deletion test per module. Deleting `PropertyReader` brings back the 60-line aggregation loop in both adapters. Deleting `Placement` brings back spread, together and offset-store code in both. Each port has two real adapters (Autodesk and mock), so the seams are real.
- Element state (select, isolate, hide) fails the deletion test. In the real adapter it is a thin translation to native calls, in the mock it is the state itself. The only shared part is listener fan-out, which becomes `SelectionHub`. Geometry and IFC reads fail it too: the real path already lives in `viewerGeometry.ts` and `viewerSource.ts`, the mock path builds fixtures, and the shared part is one `models.shown()` call. Both stay where they are.
- Load lifecycle (`loadModels`, `addModel`) shares only a few lines of prelude and diverges on order (destroyed check before or after validation) and async behaviour. Not extracted.

## Migration order

1. This spec.
2. `PropertyReader` and its tests, wired into both adapters.
3. `Placement` and its tests, wired into both adapters.
4. `SelectionHub` and its tests, wired into both adapters.

## Risks

- Native Autodesk behaviour: `place()` keeps the original placement per model and the order `applyPlacement` then `frameModels` must not change; `getAggregateSelection` fallback and the HIDE_ALL isolate encoding stay inside the real adapter. Mitigation: ports take callbacks, the real adapter keeps the exact calls, and `npm run e2e:glb` and `npm run e2e:ifc` run against the real viewer.
- Mock reads were sequential and synchronous, real reads run in parallel with `allSettled`. The shared reader uses `allSettled` for both; the mock source is synchronous so results and order are unchanged. The thrown error of a failing mock model is now the source's error, not the prefixed message.
- Mock progress was one call at the end; the shared reader reports once per model, summed. Final value is the same.
