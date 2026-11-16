# Viewer extensions

An extension here is a small module in `src/web/extensions` that works against the `ViewerAdapter` interface (see [architecture.md](architecture.md)), plus an optional React panel in `src/web/panels`. Modules never touch the Autodesk Viewer globals directly, so they run on both the real and the mock adapter and can be tested without a browser viewer.

## Structure

- `src/web/extensions/<name>.ts`: pure logic. Takes an adapter or `PropertyRow[]` and returns data or performs an action.
- `src/web/extensions/index.ts`: re-exports each module.
- `src/web/panels/<Name>.tsx`: the UI. Gets the adapter from `useViewer()` (through `useResolvedAdapter`, which also accepts an `adapter` prop for tests) and reads properties with `usePropertyRows`.
- `src/web/panels/index.ts`: exports the panel. A pane entry in `src/web/layout/paneRegistry.ts` places it in the layout (see [layout.md](layout.md)).
- `src/web/extensions/extensions.test.ts` and `panels/panels.test.tsx`: unit tests.

Property rows have the shape `{ dbId, name, properties, modelId?, modelName? }`. `adapter.getLeafProperties(names)` returns one row per leaf element of every loaded model, with a value or `null` for each requested property name and the model it came from. In a combined view dbIds repeat across models, so never key data by `dbId` alone. Use `scopeRows(rows, scope)` from `viewer/modelScope.ts` to show one model or `ALL_MODELS`. Hidden models are not read. A model whose properties could not be read has `propertiesError` set; show `unavailableModels(adapter.getModels())` next to partial results.

## Existing extensions

**Viewer tools** (`viewerTools.ts`). `buildToolGroupSpec(adapter, options)` builds the `ToolGroupSpec` for the group `bim-showcase-hub-tools`: the paint tool and the export tool. `registerViewerTools(adapter, { onStatus })` registers it with `adapter.registerToolGroup` and returns a disposer. `ViewerPane` calls it when its `tools` prop is true (the default) and shows export status as a badge in the viewer. On the real viewer the group becomes the Autodesk extension `BimShowcaseHub.Tools` in the native toolbar. On the mock viewer it is a toolbar group with a paint flyout. Find the buttons by their accessible names or titles: "Paint selection", the swatch labels, "Reset appearance" and "Export to Excel".

**Paint brushes** (`paintBrushes.ts`, `panels/PaintChip.tsx`). `PAINT_PRESETS` defines red, green and blue. `paintSelection` reads `adapter.getModelSelection()` (dbIds paired with their model), calls `setModelThemingColor` and clears the selection, so it paints across every model of a combined view. `resetPaint` calls `clearThemingColors`. The viewer tool group uses these functions. `PaintChip` is the small swatch used in the UI.

**Model summary** (`modelSummary.ts`, `panels/ModelSummaryPanel.tsx`, `panels/SummaryTable.tsx`). `summarize(rows, propertyNames)` counts values for each property (Assembly Code, Classification Code and Name by default), sorted by count and then by value. Empty values are labeled `(empty)`. The panel shows loading, empty and error states and a Refresh button. It is the Model summary pane; its collapsed state is part of the saved layout (`bsh.layout.v1`), and the count column does not wrap.

**Excel export** (`excelExport.ts`). `exportToXlsx(adapter, options)` reads the properties Category, Name, Assembly Code, Classification Code and Level, builds one sheet per Category value (sheet names are sanitized to Excel's rules and made unique), and writes the file with `write-excel-file`, loaded on demand. It reports progress through `ExportStatus` (`reading`, `building`, `done`, `empty`, `error`). The viewer shows the status as a badge for four seconds, with row counts formatted with separators. The file is named after the model and version (`exportFileName`, for example `Snowdon-Towers-v3-properties.xlsx`), or `model-properties.xlsx` without a file name. Each viewer registers its tool group with ids suffixed by a short key of its URN (`modelKey`), so two open viewers never share control ids. When the rows come from more than one model, every sheet starts with a `Model` column holding the model name.

**Dashboard** (`dashboardData.ts`, `panels/DashboardPanel.tsx`, `panels/ChartCanvas.tsx`). `shapeChartData(rows, property)` counts values, keeps the top 11 and merges the rest into "Other" when there are more than 12 categories. The panel draws a bar chart and a donut with Chart.js, and lets the user choose the property. Charts redraw with the theme colors when the theme changes. It is the Dashboard pane; its collapsed state is part of the saved layout (`bsh.layout.v1`).

## Add an extension

1. Write the logic in `src/web/extensions/<name>.ts`. Accept a `ViewerAdapter` or `PropertyRow[]`. If it needs a viewer capability that the interface lacks, add the method to `ViewerAdapter`, implement it in both `RealViewerAdapter` and `MockViewerAdapter`, and extend `adapter.contract.test.ts`.
2. Export it from `src/web/extensions/index.ts`.
3. For viewer toolbar controls, extend `ToolGroupSpec` and `buildToolGroupSpec`, then implement the new control in both the Autodesk extension (`viewer/autodeskTools.ts`) and `MockViewerAdapter.buildToolGroup`. Registration goes through `adapter.registerToolGroup(spec)`, which returns a disposer to call on cleanup.
4. For a panel, create `src/web/panels/<Name>.tsx` using `useResolvedAdapter` and `usePropertyRows`, use `StateBlock` for loading, empty and error states, and export it from `panels/index.ts`.
5. Add a pane for the panel to `PANES` in `src/web/layout/paneRegistry.ts` (see [layout.md](layout.md)).
6. Add tests with the mock adapter: logic in `extensions.test.ts`, UI in `panels.test.tsx`.
7. Run `npm run lint`, `npm run typecheck` and `npm test`, then check the page with `npm run dev:mock`.
