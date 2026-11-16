# Viewer extensions

An extension here is a small module in `src/web/extensions` that works against the `ViewerAdapter` interface (see [architecture.md](architecture.md)), plus an optional React panel in `src/web/panels`. Modules never touch the Autodesk Viewer globals directly, so they run on both the real and the mock adapter and can be tested without a browser viewer.

## Structure

- `src/web/extensions/<name>.ts`: pure logic. Takes an adapter or `PropertyRow[]` and returns data or performs an action.
- `src/web/extensions/index.ts`: re-exports each module.
- `src/web/panels/<Name>.tsx`: the UI. Gets the adapter from `useViewer()` (through `useResolvedAdapter`, which also accepts an `adapter` prop for tests) and reads properties with `usePropertyRows`.
- `src/web/panels/index.ts`: exports the panel. `routes/ModelPage.tsx` places it on the page.
- `src/web/extensions/extensions.test.ts` and `panels/panels.test.tsx`: unit tests.

Property rows have the shape `{ dbId, name, properties }`. `adapter.getLeafProperties(names)` returns one row per leaf element, with a value or `null` for each requested property name.

## Existing extensions

**Paint brushes** (`paintBrushes.ts`, `panels/PaintToolbar.tsx`). `PAINT_PRESETS` defines red, green and blue. `paintSelection` reads `adapter.getSelection()`, calls `setThemingColor` and clears the selection. `resetPaint` calls `clearThemingColors`. `registerPaintBrushes(adapter)` registers the same presets as viewer toolbar buttons with `registerToolbarButton` and returns a disposer. `ViewerPane` does this when `paintBrushes` is true. `ModelPage` passes `false` and renders `PaintToolbar` in the page toolbar instead. The toolbar disables the swatches until something is selected.

**Model summary** (`modelSummary.ts`, `panels/ModelSummaryPanel.tsx`, `panels/SummaryTable.tsx`). `summarize(rows, propertyNames)` counts values for each property (Assembly Code, Classification Code and Name by default), sorted by count and then by value. Empty values are labeled `(empty)`. The panel shows loading, empty and error states and a Refresh button.

**Excel export** (`excelExport.ts`, `panels/ExportButton.tsx`). `exportToXlsx(adapter, options)` reads the properties Category, Name, Assembly Code, Classification Code and Level, builds one sheet per Category value (sheet names are sanitized to Excel's rules and made unique), and writes the file with `write-excel-file`, loaded on demand. It reports progress through `ExportStatus` (`reading`, `building`, `done`, `empty`, `error`). The button shows the status as a badge for four seconds. The default file name is `model-properties.xlsx`.

**Dashboard** (`dashboardData.ts`, `panels/DashboardPanel.tsx`, `panels/ChartCanvas.tsx`). `shapeChartData(rows, property)` counts values, keeps the top 11 and merges the rest into "Other" when there are more than 12 categories. The panel draws a bar chart and a donut with Chart.js, and lets the user choose the property. Its collapsed state is stored in `localStorage` under `bsh.dashboard.collapsed`.

## Add an extension

1. Write the logic in `src/web/extensions/<name>.ts`. Accept a `ViewerAdapter` or `PropertyRow[]`. If it needs a viewer capability that the interface lacks, add the method to `ViewerAdapter`, implement it in both `RealViewerAdapter` and `MockViewerAdapter`, and extend `adapter.contract.test.ts`.
2. Export it from `src/web/extensions/index.ts`.
3. For a viewer toolbar button, call `adapter.registerToolbarButton({ id, tooltip, icon, onClick })` and keep the returned disposer. Call it on cleanup.
4. For a panel, create `src/web/panels/<Name>.tsx` using `useResolvedAdapter` and `usePropertyRows`, use `StateBlock` for loading, empty and error states, and export it from `panels/index.ts`.
5. Place the panel in `routes/ModelPage.tsx`.
6. Add tests with the mock adapter: logic in `extensions.test.ts`, UI in `panels.test.tsx`.
7. Run `npm run lint`, `npm run typecheck` and `npm test`, then check the page with `npm run dev:mock`.
