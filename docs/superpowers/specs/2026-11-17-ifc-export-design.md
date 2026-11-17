# IFC export from the open viewer

## Goal

An "Export IFC" button in the viewer toolbar writes an IFC4 file in the browser from what the Autodesk Viewer already holds: triangles, element properties, levels and types. No Model Derivative IFC job, no server route, no new APS scope. It works for any format the viewer opens and for the combined viewer.

The result is a mesh-based coordination view, not a Revit IFC export. It has shapes and metadata, no parametrics, no openings as voids and no connectivity. Research: `docs/research/2026-11-16-ifc-without-model-derivative.md`.

Out of scope for this spec: quantity sets, standard `Pset_*` renaming, georeferencing, instancing through mapped items, a web worker, batch export from the Documents tree, any server or worker route, a BCF viewer.

## Decisions taken

- Phase 1 only: the open model or combined view, in the browser.
- Entry point: a toolbar button, like the GLB export, with the shared status badge. The mapping options live in the Settings modal.
- Combined viewer: one IFC, one `IfcBuilding` per model, positioned with the viewer's alignment offsets.
- IfcOpenShell is a dev-only validator in the e2e venv, never bundled.

## 1. Modules

```
src/web/ifc/
  types.ts          IfcExportModel and its parts
  mapToIfc.ts       pure: ViewerSource + IfcSettings -> IfcExportModel
  buildIfc.ts       pure: IfcExportModel -> Iterable<string> (STEP text chunks)
  globalId.ts       pure: GUID or string -> 22-character IFC GlobalId
  classTable.ts     default category -> IFC class table
src/web/extensions/ifcExport.ts   exportToIfc(adapter, options), status, file name
src/web/viewer/viewerSource.ts    reads properties and geometry from the Autodesk Viewer
```

Rules:

- `ifc/` imports nothing from `viewer/`, `extensions/` or React. `buildIfc` and `mapToIfc` are testable with plain fixtures.
- `ViewerAdapter` gets one optional method, `getIfcSource?(): Promise<IfcSourceRead>`, implemented by `RealViewerAdapter` and `MockViewerAdapter`, like `getGeometryParts`. `IfcSourceRead` is `{ models: SourceModel[]; skipped: number }`.
- `SourceModel` is `{ id, name, urn, unitScale, offset: Vec3, elements: SourceElement[] }`. `SourceElement` is `{ dbId, externalId?, name, properties: Record<group, Record<name, value>>, parts: GeometryPart[] }`. Geometry is already in metres, in viewer world space.
- `exportToIfc` follows `exportGeometryToGlb`: `reading`, `building`, `done`, `empty`, `error` statuses, `missing` models, `skipped` fragments, a `save` hook, and the same badge in `ViewerPane` (the latest export wins).
- The toolbar gets a fourth control, `ToolGroupSpec.ifc`, gated by `ToolFeatures.ifc` and the setting `ifcExport` (default on), the same way `geometry` is.

## 2. Reading the viewer (`viewerSource.ts`)

- Models: the visible, ready models, as for GLB. Refuses while a model is still loading (the same `STILL_LOADING_MESSAGE`).
- Elements: the leaf `dbId`s of each model's object tree that own at least one fragment. Fragments are read with the existing `readViewerGeometry`, grouped by `dbId`. A fragment that holds several elements has no single `dbId` and is counted in `skipped`.
- Properties: `getBulkProperties(ids, {})` without a property filter, in chunks, keeping `displayCategory` as the group, `displayName` as the name and `displayValue` as the value. Empty values are dropped.
- `externalId`: from the viewer's external id mapping. Missing or duplicated ids are left unset.
- Memory: elements are produced per model and consumed by the writer before the next model is read, so the full text is never held as one string.

## 3. Mapping (`mapToIfc.ts`)

All inputs come from `IfcSettings` (section 5).

- **Class**: the element's category property value, for example `Revit Walls`, is looked up in the user overrides first and then in the default table in `classTable.ts`. No match gives `IfcBuildingElementProxy`. The original category is kept as `ObjectType`.
- **Default table** (about 20 entries): Walls, Floors, Roofs, Ceilings, Columns, Structural Columns, Structural Framing, Doors, Windows, Stairs, Railings, Ramps, Curtain Wall Panels, Furniture, Plumbing Fixtures, Pipes, Ducts, Generic Models, and so on. The table maps to the class name only. A class whose predefined type is required gets `NOTDEFINED`.
- **Storey**: the value of the configured level property, default `Level`. Elements without one go to the fallback storey, default `Unassigned`. Storey elevation is not set unless the viewer exposes it as a property named `Elevation`, in which case it is read once per level.
- **Type**: the `Type Name` property (or the Revit family-type name in the tree) gives one `IfcTypeObject` per type, linked with `IfcRelDefinesByType`. The type class follows the element class (`IfcWallType` for `IfcWall`, and `IfcBuildingElementProxyType` for proxies).
- **Property sets**: one `IfcPropertySet` per viewer property group that passes the include and exclude rules. Names are kept as they are, empty groups are dropped. Values map to `IfcLabel`, `IfcReal`, `IfcInteger` or `IfcBoolean` by JavaScript type, and anything else is `IfcLabel`.
- **GlobalId** (`globalId.ts`): if `externalId` contains a 36-character GUID, compress those 128 bits to the 22-character IFC form. Otherwise hash `urn + externalId` (or `urn + dbId` without an external id) to 128 bits and compress the same way. The same input always gives the same id. The spec makes no claim of parity with Revit's own exporter ids.
- **Colour**: the part colour becomes an `IfcSurfaceStyle` with a rendering, shared by colour. Transparency maps to the rendering's transparency.
- **Units**: geometry arrives in metres. For the `mm` setting, coordinates are multiplied by 1000 and the project unit is `MILLIMETRE`; for `m` it is `METRE`. Areas and volumes are not written, so only the length unit is declared.
- **Placement**: geometry is read in the viewer's world space, which already contains the combined-view placement, so every building has an identity placement and no offset is written.

## 4. Writing (`buildIfc.ts`)

- IFC4 (`FILE_SCHEMA(('IFC4'))`), ASCII STEP, a generator that yields strings of a few thousand lines each. `exportToIfc` collects them as `Blob` parts and saves with `saveBlob`, type `application/x-step`.
- Entities used: `IfcProject`, `IfcUnitAssignment`, `IfcGeometricRepresentationContext` and a `Body` sub-context, `IfcSite`, `IfcBuilding`, `IfcBuildingStorey`, the mapped element classes, `IfcTypeObject` subclasses, `IfcTriangulatedFaceSet` with `IfcCartesianPointList3D`, `IfcShapeRepresentation` (`Body`, `Tessellation`), `IfcProductDefinitionShape`, `IfcLocalPlacement`, `IfcPropertySet` with `IfcPropertySingleValue`, `IfcSurfaceStyle` with `IfcStyledItem`, and the relationships `IfcRelAggregates`, `IfcRelContainedInSpatialStructure`, `IfcRelDefinesByType`, `IfcRelDefinesByProperties`.
- Header: `FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'), '2;1')`, `FILE_NAME` with project name, author and organisation from settings, the generator name `BIM Showcase Hub` and an ISO timestamp.
- One element with several fragments gets one `IfcTriangulatedFaceSet` per fragment inside one shape representation.
- Parts with broken indices are skipped and counted, as in the GLB writer. Indices are written 1-based and in the range of their point list.
- Strings are escaped for STEP (`'` doubled, backslash, non-ASCII as `\X2\...\X0\`).
- Entity ids are assigned in one counter so that every reference resolves. The writer holds no data after a chunk is yielded except the id counter and the shared-style map.

## 5. Settings

`Settings` stays one typed object under `bsh-settings-v1`, extended with:

```ts
ifcExport: boolean;        // toolbar button, default true
ifc: {
  classOverrides: Record<string, string>;   // category -> IFC class name, default {}
  psetExclude: string[];                    // viewer property groups to leave out, default []
  psetInclude: string[];                    // when non-empty, only these groups, default []
  levelProperty: string;                    // default 'Level'
  fallbackStorey: string;                   // default 'Unassigned'
  projectName: string;                      // '' means the model file name
  siteName: string;                         // default 'Site'
  buildingName: string;                     // '' means the model name
  author: string;                           // default ''
  organisation: string;                     // default ''
  lengthUnit: 'm' | 'mm';                   // default 'm'
}
```

- `readSettings` validates each field and falls back to its default, so a stored object from before this change still loads. The nested `ifc` object is validated field by field.
- Class names are checked against an allow-list of the IFC4 element classes the writer knows. An unknown name is ignored with the proxy fallback.
- The Settings modal gets a section "IFC export" below "Experimental features", with the switch for the toolbar button and these fields. The class overrides are an editable list of pairs (category and class chosen from the allow-list) with add and remove. The group lists are comma-separated text fields. The modal size becomes `lg` if the section needs the room. Sections do not become a framework: this is one more block in `SettingsBody`.
- The mapper reads settings at export time through the same `useSettings` value the toolbar already receives (the export closure reads the latest settings through a ref, so changing a field does not re-register the toolbar).

## 6. Errors and edge cases

- No geometry, model still loading, or a closed viewer: the same messages as the GLB export.
- A model with no properties: elements are still written, as proxies with no property sets.
- Missing models (not ready) are reported as in the GLB status. Hidden models are not exported.
- Duplicate `GlobalId` (the same `externalId` on two elements): the second gets a deterministic hash from its `dbId`, with no warning.
- Very large models: the status shows the element and triangle counts while building. There is no size cap in this phase. If the tab runs out of memory the export fails with the standard error badge.

## 7. Testing

- `globalId.test.ts`: a known GUID gives its known IFC id, hashes are stable and 22 characters, characters stay in the IFC alphabet.
- `mapToIfc.test.ts`: category lookup with overrides, fallbacks, storey, type grouping, pset include and exclude, duplicate ids.
- `buildIfc.test.ts`: header, units, one building per model, STEP escaping, 1-based indices in range, every `#n` reference resolves to a defined entity, deterministic output for the same input.
- `viewerSource.test.ts`: fake viewer with leaf ids, chunked properties, fragments grouped by `dbId`, multi-dbId fragments skipped, loading refused.
- `ifcExport.test.ts`: statuses, skipped and missing, file name.
- Settings tests: defaults, corrupt nested storage, partial storage from before the change, the new section.
- `ViewerPane` and tool-group tests: the new button is gated by the setting, one group after toggling, the badge shows the IFC status.
- Mock adapter: `getIfcSource` returns a box element with properties so `mock_smoke.py` can export and check the file.
- `npm run e2e:ifc`: the harness in `e2e/harness/` also exports IFC from `rac_advanced_sample_project.rvt`. The Python check validates the file with IfcOpenShell (installed in the e2e venv only), asserts the element count against the viewer, a non-zero bounding box, one storey per Revit level and a `GlobalId` on every product. The mock run asserts the same without a real model.

## 8. Docs

`docs/extensions.md` gets an IFC export section and the new tool feature. `docs/development.md` gets `e2e:ifc`. A short "limits" note in the README feature list says the IFC is a mesh coordination view.

## Risks to settle during implementation

- Whether `getBulkProperties` without a filter is fast enough on a large Revit model. If not, chunk size and a property group filter become tuning knobs, not new settings.
- Whether the viewer's external id mapping is complete for SVF2. If not, ids fall back to the URN and `dbId` hash.
- IfcOpenShell may warn about proxies with predefined types or missing required properties. The validation test fails only on schema errors, not on warnings.
