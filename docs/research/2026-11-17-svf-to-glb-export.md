# Exporting SVF geometry to GLB

Date: 2026-11-17. Status: research plus an MVP implemented in the app.

## Question

Can the app turn an APS Viewer model into a file that opens on a normal PC, without a Revit install, Autodesk account or the Viewer? The target is binary glTF (`.glb`): Windows 3D Viewer, macOS Preview/Quick Look where supported, Blender, three.js and most game engines open it.

## Short answer

Yes. The Viewer already holds the triangles it draws. For SVF and SVF2 the browser can read every fragment through `model.getFragmentList()`, apply the fragment world matrix, and write a glTF 2.0 binary container itself. The MVP does exactly that and downloads a GLB from the viewer toolbar. It works for any format the Viewer can open: RVT, NWC, NWD, DWG, IFC.

The alternative is server-side `svf-utils`, which reads a downloaded **legacy SVF** derivative and writes `.gltf` (not GLB). It cannot read SVF2, its GitHub repo is gone, and it needs a translation job per model. It is a reasonable batch/headless route later, not the MVP.

Model Derivative has **no glTF/GLB output**. For Revit, Navisworks and DWG its only mesh output is SVF/SVF2. `obj`, `stl`, `step` etc. are listed only for source formats that support them; GLB is an input format, not an output.

## Where the geometry is

Verified against the unminified Viewer 7.100.0 bundle (public CDN, source maps) and against a real Revit model in the Viewer:

- `model.getFragmentList()` returns the fragment list.
- `fragments.getCount()` is the fragment count.
- `fragments.getGeometry(fragId)` returns the geometry, or `null` for a fragment that is not loaded.
- `fragments.getVizmesh(fragId)` returns a **reused scratch mesh** with `geometry`, `material`, `dbId` and `matrixWorld`. Copy what you need immediately; do not keep the mesh.
- `fragments.isLine(fragId)` and `isPoint(fragId)` identify non-triangle fragments.
- `fragments.getDbIds(fragId)` maps a fragment to a dbId (an array for 2D).
- Geometry uses interleaved buffers:
  - `geometry.vb`: `Float32Array`, all vertex attributes interleaved.
  - `geometry.vbstride`: stride **in floats**, not bytes.
  - `geometry.attributes.position.offset` (alias `itemOffset`): position offset in floats.
  - `geometry.ib`: `Uint16Array` or `Uint32Array` triangle indices.
  - `geometry.polyCount`: triangle count for that geometry.
  - There is no `getVertexBuffer()`, `getIndexBuffer()`, `numVertices` or `isSaveable()` in 7.x. `attributes.position.array` is usually `undefined`.
- `getWorldMatrix()` (and the scratch mesh's `matrixWorld`) already includes the fragment transform, placement transform and global offset. Do **not** apply `placementTransform` again.
- `model.getUnitScale()` converts model units to meters (for example `0.3048` for feet). Multiply world positions by it so the GLB follows the glTF meter convention.
- The viewer world is Z-up; glTF is Y-up. Rotate `(x, y, z) → (x, z, -y)`.
- For SVF2 the geometry is streamed, but once `model.isLoadDone()` is true a normal model has all fragments. On the real Revit sample: 6,542 fragments, 6,542 with geometry, 0 unloaded, 1.4M triangles.
- Gate the export on `isLoadDone()` / `GEOMETRY_LOADED_EVENT`. A partially loaded SVF2 model can return `null` geometry, so skip and report those fragments rather than writing holes silently.

## Options considered

### 1. Browser fragment reader + hand-written GLB (chosen)

- Input: the model already loaded in the Viewer. No new APS job, no upload, no storage.
- Output: one GLB with positions, indices and one material per colour. Each element (model and dbId) is one node and mesh with `extras: { dbId, model }`, so geometry joins to the property rows by dbId (about 6,500 nodes for the Revit sample).
- Pros: works for every source format, no server cost, no customer data leaves the browser.
- Cons: undocumented Viewer internals (pin the viewer version), no textures/UVs/normals in the MVP, geometry only as complete as the viewer has loaded.

### 2. Server-side `svf-utils` (future batch route)

Verified by installing `svf-utils@8.0.0`:

- License MIT, Node ≥ 20, CJS, about 20 MB installed, single maintainer. Both the `svf-utils` and `forge-convert-utils` GitHub repositories return 404; the npm tarball still ships source.
- `SVFReader.FromFileSystem(path)` + `GLTFWriter().write(scene, dir)`; output is always `output.gltf` plus `.bin` sidecars. It does **not** write GLB and has no Draco/meshopt.
- SVF2 support was **removed** in 8.0.0 ("as requested by APS leadership"). It reads only legacy SVF. Requesting `svf` (not `svf2`) in the Model Derivative job is mandatory.
- It reads a directory: `output.svf` (a small zip with manifest/metadata) plus every asset listed in `manifest.json`. `SVFDownloader.download(urn, …)` can do that, or call `GET /modelderivative/v2/designdata/{urn}/manifest/{derivativeUrn}/signedcookies` per asset and preserve the relative paths.
- Real-model compatibility was not tested (no easy legacy-SVF sample). Synthetic SVF read/write passed with 0 validator errors.
- `npm audit` reports high-severity issues in `adm-zip` (it parses untrusted input) and `axios`; vendor/fork and patch if used.
- Memory is roughly 2.8× the SVF size for a full read. Prefer a container/queue worker over a Vercel function for big models.
- GLB conversion after `svf-utils`: read `.gltf` with `@gltf-transform/core` and `writeBinary()`, or run `gltf-pipeline`/`gltfpack`.

Autodesk's `aps-extra-derivatives` (SVF → glTF/GLB/Draco/USDZ) is MIT but was archived on 2026-03-16; use as reference only.

### 3. Model Derivative direct output

Not possible for RVT/NWC/NWD/DWG. The supported-translations matrix lists only SVF/SVF2 (plus IFC for RVT and DWG/F3D for DWG). OBJ/STL/STEP are not offered for these sources, and none of them would carry the same element identity.

## MVP in this repository

- `src/web/extensions/glbExport.ts`
  - `buildGlb(parts, options)`: groups parts by element, converts Z-up to Y-up, writes positions and indices straight into one binary buffer, then the 12-byte header, JSON chunk and BIN chunk. Uses `Uint16` indices when possible, computes mandatory POSITION `min`/`max`, marks translucent materials as `BLEND`, sets `doubleSided`, and skips parts with broken indices.
  - `exportGeometryToGlb(adapter, options)`: reading → building → done/empty/error status, saves the blob.
  - `geometryFileName`, `describeGlbStatus`.
- `src/web/viewer/viewerGeometry.ts`: reads fragments from every loaded model, skips 2D/line/point/unloaded fragments, applies `matrixWorld` and `getUnitScale()`, reads the material colour.
- `ViewerAdapter.getGeometryParts()`: optional; implemented by `RealViewerAdapter` and `MockViewerAdapter` (a real triangle box, so mock mode exercises the whole path).
- Toolbar: a second export button, `Export geometry (GLB)`, with its own status badge. File name mirrors the Excel export: `Snowdon-Towers-Sample-v3-geometry.glb`.
- No new dependency, no server endpoint, no APS job.

### GLB writer details that matter

- `bufferViews[]` entries must include `buffer: 0`. Omitting it produces a file some parsers accept and strict loaders reject (`@gltf-transform/core` failed until this was fixed).
- Chunks are 4-byte aligned; JSON pads with spaces (0x20), BIN with zeros.
- `POSITION` accessors need `min` and `max`.
- Index `componentType` is 5123 (`Uint16`) below 65,536 vertices and 5125 (`Uint32`) above.
- Do not reuse the Viewer's THREE r71 `GLTFExporter`; it is not compatible with the modified `LeanBufferGeometry` (`vb`/`ib`, `attributes.*.array` undefined).

## Verification

### Mock E2E (`e2e/mock_smoke.py`)

157/157 checks pass, including:

- geometry export downloads a non-empty file with the `glTF` magic
- the GLB parses (header, chunks, bufferViews, accessors, bounds)
- triangles, vertices and meshes are non-zero
- the combined viewer exports one GLB covering several models

### Real Revit E2E (`e2e/glb_revit.py`)

The app's normal viewer route needs a three-legged sign-in. For a repeatable model test the script drives `e2e/harness/index.html` with a two-legged token from `.env` and the same Viewer build the app uses. It opens a real Revit sample (`rac_advanced_sample_project.rvt`, 15 MB, translated to SVF2 in the app's APS bucket) and calls the app's exporter bundle.

Result: 12/12 checks in about 14 s (warm CDN).

- 6,542 fragments, all with geometry
- unit `ft`, scale `0.3048`, bounds 1016.6 × 438.7 × 49.4 ft
- exported GLB: 28,158,504 bytes, 1,399,107 triangles, 1,031,171 vertices, 44 meshes, bounds 309.9 × 15.1 × 133.7 m
- independent read with `@gltf-transform/core`: 44 meshes, 44 primitives, 1,399,107 triangles, 1,031,171 vertices, 44 materials
- independent render with Google `<model-viewer>` 4.0 in Camoufox: `loaded: true`, `modelIsVisible: true`, no console errors; the building, site and trees draw correctly ([screenshot](../images/svf-glb-export.png))
- no page or console errors (Mixpanel telemetry from the Viewer is ignored)

Run it with:

```bash
npm run e2e:setup
e2e/.venv/bin/python e2e/glb_revit.py
```

`E2E_REVIT_URN` selects another model. The default URN is a sample uploaded to the app's APS bucket by the research probe; if it disappears, upload and translate another Revit file and set the variable.

## Limitations and next steps

- **Materials**: base colour and opacity only. Textures, UVs, normal maps and metallic/roughness are dropped.
- **Normals**: omitted; glTF clients compute flat normals. This keeps the file around 27 MB for 1.4M triangles. Adding normals would grow it by about 12 MB before dedupe.
- **Element identity**: the dbId is in `extras` on each node. A fragment that holds several elements has no single dbId and is exported without one. Properties are not in the GLB; a sidecar JSON or CSV keyed by dbId is a later option.
- **Visibility**: the exporter reads all loaded models. Hidden models and isolated elements are included; hidden fragments are not filtered.
- **SVF2 streaming**: a very large model that has not finished streaming can yield `null` geometry for some fragments. The reader skips them; a progress/coverage report would be better.
- **Memory**: one transformed copy of the positions per fragment is read, then written once into the output buffer. A 1.4M-triangle model is fine; a 20M-triangle model needs a streaming writer or Web Worker.
- **Batch/headless**: add a server route using `svf-utils@8.0.0` with legacy `svf` output and `@gltf-transform/core` for GLB, pinned and vendored, in a container or queue worker. Do not run it in a Vercel function for large models.
- **Cleanup**: the probe created a persistent OSS bucket `bim-showcase-probe-2026` with the sample RVT (15 MB) and its SVF2 translation. Delete the object and bucket when the sample is no longer needed. The e2e script only needs `viewables:read` and `data:read`; no write scope is required to run it.

## Sources

- Viewer bundle (unminified, source maps): https://developer.api.autodesk.com/modelderivative/v2/viewers/7.100.0/viewer3D.js
- APS blog, working with scenes and geometry: https://aps.autodesk.com/blog/working-2d-and-3d-scenes-and-geometry-forge-viewer
- Extracting triangles from fragments: https://stackoverflow.com/a/64801913 and https://stackoverflow.com/a/50362315
- Why a modern THREE GLTFExporter fails: https://stackoverflow.com/questions/69960687/exporting-forge-viewer-scene-to-gltf
- `svf-utils` on npm: https://www.npmjs.com/package/svf-utils
- Archived `aps-extra-derivatives`: https://github.com/autodesk-platform-services/aps-extra-derivatives
- Supported translations: https://aps.autodesk.com/en/docs/model-derivative/v2/developers_guide/supported-translations/
- Model Derivative job reference: https://aps.autodesk.com/en/docs/model-derivative/v2/reference/http/job-POST/
- Signed derivative downloads: https://aps.autodesk.com/blog/download-derivative-files-using-new-signedcookies-api-without-setting-cookies-first-header
- glTF 2.0 specification: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
