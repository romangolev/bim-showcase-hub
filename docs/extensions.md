# Extensions

An extension is a small module in `src/web/extensions` that works against the `ViewerAdapter` interface ([architecture.md](architecture.md#vieweradapter)), plus an optional React panel in `src/web/panels`. Modules never touch Autodesk Viewer globals, so they run on the real and the mock adapter and can be tested without a browser viewer.

## Structure

- `src/web/extensions/<name>.ts`: pure logic. Takes an adapter or `PropertyRow[]`.
- `src/web/panels/<Name>.tsx`: the UI. Gets the adapter from `useViewer()` (through `useResolvedAdapter`) and reads properties with `useScopedRows`.
- `src/web/panels/index.ts`: exports the panel. A pane entry in `paneRegistry.ts` places it ([layout.md](layout.md#add-a-pane)).
- Tests: `extensions/extensions.test.ts` and `panels/panels.test.tsx`.

A property row is `{ dbId, name, properties, modelId?, modelName? }`. In a combined view dbIds repeat across models, so never key data by `dbId` alone. Use `scopeRows` from `viewer/modelScope.ts` to show one model. A model whose properties failed has `propertiesError`: show `unavailableModels(adapter.getModels())` beside partial results.

Read rows with `useScopedRows` in panels and `readScopedRows` (`viewer/scopedRows.ts`) in async code, never `readLeafRows` directly ([architecture.md](architecture.md#scoped-rows)). `readScopedRows` can return partial rows: when `failed` is non-empty, a model's data is missing, so check it before using the rows. `peekScopedRows` is the count-path probe: it takes no property names, returns `null` on a cold cache, and returns the columns that were already cached. Render states with `StateBlock`.

## Built in

| Extension | Where | Notes |
|---|---|---|
| Viewer tools | `tools/` | `PaintTool`, `ExcelExportTool`, `GlbExportTool`, `IfcExportTool`, registered in `tools/index.ts` |
| Paint | `paintBrushes.ts`, `tools/paint/` | Named palettes with numbered markers, ghost-rest isolate and the viewer shortcuts ([Paint](#paint)) |
| Model summary | `modelSummary.ts`, `panels/ModelSummaryPanel.tsx` | Counts values per property. Row click selects, isolates, hides or zooms |
| Dashboard | `dashboardData.ts`, `panels/DashboardPanel.tsx` | Chart.js bar, horizontal bar, doughnut and table charts, presets, PNG, CSV and copy. Each view carries its own property list and its spec: aggregate (`count`, `sum`, `avg`, `min`, `max`), a numeric measure, top-N and an Other bucket. One parser (`measureParse.ts`, shared with the summary) converts within a unit family (mm→m, l→m³, lb→kg) and refuses a chart whose values span families instead of summing them. `healthKpis.ts` computes model-health tiles (element count, missing must-have values, empty values, duplicate values) as pure data; a tile's tone is always paired with text, and it is a data check, not a BIM standard |
| Excel export | `excelExport.ts`, `exportFormats.ts`, `tools/excel/` | XLSX, CSV, JSON or copy, with built-in and saved presets, group-by, content-sized columns and optional `(empty)` text ([Table export](#table-export)) |
| GLB export | `glbExport.ts`, `viewer/viewerGeometry.ts` | Binary glTF 2.0 from `adapter.getGeometryParts()`. Capped at 256 MB |
| IFC export | `ifcExport.ts`, `ifc/` | IFC4 STEP file from `adapter.getIfcSource()`. A mesh-based coordination view, not a Revit IFC export |
| Properties | `panels/PropertiesPanel.tsx` | Read-only property list of the selected elements |
| Selection sets, viewpoints | `viewer/selectionSets.ts`, `viewer/setResolution.ts`, `viewer/viewpoints.ts` | Saved items of kind `selection-set` and `viewpoint`. A set holds up to 10,000 elements, keeps stable external ids where the model has them, and merges two sets as a union or an intersection |

Exports over 20,000 rows ask for confirmation with a browser dialog. End-to-end scripts must accept dialogs.

## Panes menu and appearance

Every `PaneDefinition` carries `description`, `category` and `keywords` beside `title` (`layout/paneRegistry.ts`). `PanesMenu.tsx` searches all four and groups the result by category.

- The top bar Panes menu (`layout/PanesMenu.tsx`) is a search dialog. Each row comes from `paneCommandsFor`: Open/Close for a normal pane, New for a user kind, and any `PaneDefinition.commands` hooks. Focus and the extra commands sit beside the main action. The footer holds the rest of `layoutCommands`: the workspace actions (save, import, download, copy JSON, share link, revert), Present, Lock and Reset. A kind with no command at all, such as the Viewer, has no row.
- With a query the category groups collapse into one "Matching panes" list. Without one, the rows are grouped by category.
- Titles and colour tags are per panel id, so a plain pane uses `summary` and a copy uses `chart:1`, and each copy keeps its own. They live in the personal `bsh.pane.appearance.v1`. A title is trimmed to 48 characters; an empty title restores the registry title. A colour is red, orange, yellow, green, blue or purple and shows as a dot on the pane's tab. Both survive closing the pane and a reload, and a saved workspace carries them ([layout.md](layout.md#workspaces)).

## Table export

`excelExport.ts` reads one scoped set of rows and writes XLSX, CSV, JSON or clipboard text. Settings live in `bsh.tool.excel.v1`.

- Cells starting with `=`, `+`, `-` or `@` are guarded in CSV and copied text. XLSX writes numeric values as numbers with a number format and freezes the bold header.
- Every element sheet ends with a bold totals row: sums for number columns and labelled counts for text columns. Columns named like `Type Id`, `Workset ID` or `TypeId` stay text and are left out of the totals. CSV, JSON and copy keep plain values and have no totals row.
- A preset stores its columns, format, scope, name pattern, header toggle and group-by (`tools/excel/exportPresets.ts`, saved kind `export-preset`). Three built-ins sit beside the user presets: **Classification audit** (Category, Name, Assembly Code, Classification Code; grouped by Category), **Levels and categories** (Level, Category, Name; grouped by Level) and **Everything** (every discovered column, one sheet; disabled while the property catalog is empty). Applying a preset writes its group-by too.
- Group by is also a settings field: one sheet, or one sheet per value of any exported column. A group-by that is not among the chosen columns falls back to one sheet, and sheet names are made unique within Excel's 31-character limit.
- XLSX columns size to their content, clamped to 8–60, and the totals row is measured with them. There is no manual width.
- Empty cells are blank by default; `(empty)` writes that text instead. It applies to XLSX, CSV and copy, not JSON, which keeps an empty string.
- The **Export pane** (pane id `export`) runs the same export with a preview: the property picker, scope, format, file name and presets, the first 20 rows of the chosen columns and scope, and the last status for that adapter. It opens from the Panes menu, the palette or **Open Export pane** in the Excel settings; the toolbar button stays the quick export that reuses the last settings. Both run one `excelJob`, so they cannot export at the same time.
- **Color column** adds a `Color` label and a `Color hex` value after the properties; **Legend sheet** adds a Legend sheet with value, colour and count. Both read the active coloring (`viewer/modelColoring.ts`) at export time and stay empty for elements it does not cover. An XLSX `Color hex` cell is filled with its colour. CSV, JSON and clipboard text carry the two text columns only.
- **Column formats** (Column formats in the picker) set a format per chosen property: Auto keeps today's behaviour, Text forces a string cell, Number forces numeric parsing (a non-number stays text), and Number with unit column writes the parsed number and adds a `<name> unit` column right after it. A measure cell that does not parse stays text with an empty unit. Export presets do not carry formats.
- **Ask before exporting over** sets the confirmation threshold (default 20,000 rows, clamped to 1,000–1,000,000). `0` never asks. Scripts that export in a browser must still accept dialogs.

## Model summary view

The summary view (`extensions/modelSummary.ts`) also carries a `layout` (`flat`, `grouped` or `pivot`), an ordered `groupBy`, a `measure` with `unitLabel` and `precision`, and per-block `titles`. `sanitizeView` fills every one of them from an older blob. `SummaryTable` renders them from props; a `flat` view with no measure keeps the original table. The pure helpers are:

- `summaryBlocks(entries)` splits flat entries into one block per property in entry order.
- `pivotTree(rows, groupBy, { measure })` nests rows by the ordered properties. A node is `{ value, count, children, measure }`, and `count` is the subtree total.
- `parseMeasure(cell)` wraps the shared parser and keeps only length, area, volume and unitless values (for example `m²`, `m³`, `m`, `mm`, `ft`). `measureOf(rows, property)` and `measureByValue(rows, valueProperty, measureProperty)` sum it per group, converting millimetres to metres; a group with mixed unit families, or none of the values numeric, is `mixed` or `missing` and renders `n/a`.
- `formatMeasure(cell, { precision, unitLabel })` formats a cell, and `countShare(count, max)` gives the count bar's percentage.
- `blockTitle(titles, property)` falls back to the property name, and `sanitizeGroupBy` and `sanitizeTitles` guard the stored view.

## Paint

`PaintTool` (`tools/paint/`) turns a palette into viewer toolbar paint entries and stores its settings in `bsh.tool.paint.v1`.

- Palettes: **Default** (red, green, blue), **Okabe–Ito**, **Viridis**, **High contrast** and **Custom swatches** (1 to 8 colours). Each swatch becomes a paint entry with a numbered marker, which appears in the entry's tooltip and in the settings list, so colour is not the only cue.
- Intensity (0.1 to 1) is theming strength, not transparency. Painting colours the current selection and clears it, per `(modelId, dbId)`.
- `ghostRest` is on by default, like the viewer's own `ghosting` setting: isolating leaves the rest of the model visible but faded, and painted colours are unaffected. Turning it off hides the rest through `adapter.setGhosting(false)`. Turning the tool off puts ghosting back on and clears the paint.
- Paint history lives in `tools/paint/paintHistory.ts`. Every action is one record per touched model and model version (`bsh.paint.<hash>`, a personal family), holding the ordered actions and an undo cursor. Undo and redo move the cursor and re-apply the whole visible plan; each model keeps `historyDepth` actions (1 to 50, default 20). `recordPaint`, `undoPaint`, `redoPaint` and `clearPaintState` are the only entry points, and all of them apply through `applyPaintPlan` in `paintBrushes.ts`, which writes the `paint` source of `viewer/colorLayers.ts`. That layer is the only production caller of `adapter.setModelThemingColor`, so paint, chart colouring and model tints resolve by source order instead of overwriting each other.
- `restoreOnOpen` (on by default) replays a model's saved paint after the model is ready: `ViewerTool.onModelsReady` calls `replayPaint`, which waits up to 2 s for `adapter.getVisible()` so the object tree can answer, then applies every stored id. It never rewrites the record: an id that does not currently resolve is ignored by the viewer, and paint on hidden or isolated elements is not lost. A record saved for another model version is ignored.
- Reset appearance clears the paint source only, in every model a combined scene holds, so chart colours and model tints stay; it also forgets the paint records of the open models.
- The shortcut map (`commands/viewerShortcutMap.ts`, stored in `bsh.commands.viewer.keys.v1`) defaults to `i` isolate, `h` hide selection, `shift+h` show all, `mod+i` invert selection, `mod+z` undo paint, `mod+shift+z` redo paint, `mod+alt+b` paint with the first swatch and `mod+alt+shift+r` reset appearance. Paint settings list the effective keys and offer Reset shortcuts. There is no capture-a-key UI yet: `setViewerShortcut(command, keys)` is the data-level seam.

## Colors

The Colors pane (`panels/ColorsPanel.tsx`, pane id `colors`) colours the model by a property, by a chart or by rules, and shows a legend for what it applied. It is a viewer follower that stays closed until the user opens it (`opensWithModel: false`), so it does not appear beside the Summary on every model.

- One store owns the colouring: `viewer/modelColoring.ts` keeps at most one `Coloring` per adapter and writes it to the `chart` source of `viewer/colorLayers.ts` through `replaceSource`, in one settle. Property colouring, chart colouring and rules all replace that source, so the last one applied wins; paint stays above it and the model tint stays below.
- Values mode colours each distinct value with the chart palette (`seriesColors(readChartTheme(), labels, palette)`), so a value keeps the same colour in a chart and in the model. **Top values** folds the rest into Other (3 to 24 values, default 10) and a legend swatch overrides one value's colour. Ranges mode bins numbers into six quantiles with the Viridis ramp, using the shared measure parser; values in mixed unit families produce a note instead of colours, and cells that do not parse are shown as "(no value)".
- Rules mode (`extensions/colorRules.ts`) evaluates an ordered list of rules (equals, contains, range, empty) and gives each element the first matching rule. **Everything else** adds a fallback colour and **Ghost the rest** isolates the rule hits and leaves the remaining model faded. Presets are the saved kind `color-rules` and can be loaded, saved, duplicated and deleted; import and export come with the saved-items envelope.
- The legend (`panels/ColorLegend.tsx`) lists the swatch, value and count of every entry and can hide or show one group, isolate it, override its colour, clear the colouring and download the legend as CSV. Clear colours also persists `active: false`.
- The pane settings (`bsh.pane.colors.v1`) hold the mode, the property or rules, the top N, the overrides, the active flag and the working rule set.
- **Color the model by this chart** in a chart's menu applies that chart's buckets and colours through the same store; the Colors pane then shows its legend.

## Share links

The Share menu copies a link to the model with or without the current view. The link opens only for people who already have Autodesk access to those files: there is no public token route, no public viewer, and a hub model is never copied, so the menu and this section say so. The view travels as `?view=` on the model URL. The encoded value starts with its format version: version 1 carries the camera and the selection, version 2 adds the open and collapsed panes and the chart views, and version 3 adds the hidden and isolated node ids. A build that does not know a pane id ignores it while still applying the camera. `viewer/incomingLink.ts` owns opening a link (`useIncomingLink`, called by `ViewerPane` for the routed viewer). It reads `view` from the router search (`ModelPaneBody` passes it as `initialView`), parses it once, applies the panes and charts, and clears `view` with a router `navigate({ replace: true })` (`onViewConsumed`), so a reload does not apply it again; a ref guard keeps a re-run before the router clears from applying twice, and a malformed link is cleared without applying. It then waits until the link's models are listed and none is loading before it sets the camera and selection and restores the hidden and isolated elements through `adapter.restoreState`. Opening a link only opens panes and sets collapsed state, never closes a pane, puts its charts into newly added chart panes and overwrites the dashboard view; this is separate from applying a workspace. The `#layout=` hash is not part of it: `LayoutProvider` reads it and hands it to `layoutApply.applyShared`. A current link reads `?view=3~...` when it carries node ids and stays at version 2 otherwise.

- Version 2 names the open pane kinds and the collapsed panes. Collapsing exists only for Documents, Model summary, Dashboard and Models. Chart, Model summary and Properties are instance kinds: a link leaves them to the chart views instead of opening a blank pane.
- Version 3 adds `nodes`: per model, the isolated dbIds and the hidden dbIds (`-1` is the hide-all sentinel). A link carries at most 400 node ids; a larger set is left out and the link falls back to version 2, or version 1 without panes and charts. Models the node list does not name are restored with nothing hidden or isolated and keep the selection the link gives them.
- The chart views are the Dashboard view plus up to three chart pane views, each with its own property list. A view scoped to a personal selection set travels without its `elements` scope, because the set itself is not shared.
- The summary pane's properties, element scope and view are not part of the link.
- The Share menu can leave parts out before it builds the link: **Include selection**, **Include panes and charts** and **Include hidden and isolated**, saved in `bsh.share.v1`. The camera is always included. Every option is on by default, so a plain copy link carries the whole view.
- A link over 4,000 characters is cut to the camera and selection (version 1) and the Share menu says so. When it is, the menu also offers **Save view data (JSON)**: a `bsh-view` version 1 file with the model list and the whole view, named `<model>-view.json`. Chart panes beyond the first three are left out with their own notice.
- Panes are restored only in the dock layout. In the stacked (narrow) layout the link applies the camera and the selection and leaves the stored layout alone.

## Print report

Share > Print report... opens an options dialog first, then writes a printable page into a new window, so the browser has to allow the pop-up. The dialog sets:

- **Title** (up to 120 characters, filled with the model name) and **notes** (up to 2000 characters), printed under the header.
- **Sections**: Snapshot, Summary and Dashboard. These checkboxes cover the three top-level sections only; there is no per-property or per-chart include list.
- **Orientation**: portrait or landscape.

The dialog opens with all sections on, no notes and portrait every time. A **template** (saved kind `report-template`, version 1) stores the title, notes, orientation and sections: the Template list applies one, and **Save template** stores the current options under a name. Templates are removed from Settings > Saved items like any other saved kind. The printed page repeats table headers on every page and keeps a heading with its table. The page holds:

- the title and version, the number of elements in the summary scope, the number of models and today's date;
- the model snapshot at the resolution chosen in Snapshot settings, when Snapshot is on;
- up to six summary properties with eight values each and a "N more values" line, filtered and sorted by the summary pane's view;
- up to three Dashboard properties as value and count tables, when Dashboard is on. The charts print as tables, not as chart images, a property that is also in the summary list is not charted, and a property with no values is skipped;
- the names of models whose properties could not be read.

## Add a tool

A tool is a viewer toolbar entry with its own settings window.

1. Write the logic in `src/web/extensions/<name>.ts`.
2. Add `src/web/tools/<id>/<Name>Tool.tsx`, a class extending `ViewerTool<Settings>`:
   - Set `id`, `title`, `description` and `settings`: a `defineRecord` under `bsh.tool.<id>.v1`, with `enabled: readEnabled(raw)` in the sanitizer.
   - Implement `contribute(ctx, settings)` to return toolbar entries.
   - For options, set `form` (a `FormDefinition`) or override `renderFields()`.
   - For exports, use `exportEntry`, `exportStem`, `exportFileName`, `confirmLargeExport` and `statusReporter` from `tools/kernel/exportKit.ts`. Set `exportTitle` to get a palette command.
   - `ctx.current(this)` returns the settings run through the record's sanitizer, so an export never sees a field the user has just cleared. Storage keeps the raw text while the field is edited.
   - Override `toolbarSignature`, `onDisabled`, `onSettingsChanged` and `scrub` only when needed. `onSettingsChanged(adapter, previous, next)` runs when the toolbar-relevant settings change, and once on the first run with `previous` undefined. Put adapter side effects there, never in `contribute`. `scrub` blanks personal text on sign-out. If the scrubbed write fails, the record is removed.
3. Register it in `src/web/tools/index.ts` with `.register(new YourTool())`. The registry rejects duplicate ids and settings keys.
4. Test the class with a fake `ToolContext` (see `tools/glb/GlbExportTool.test.tsx`).

`ViewerPane` calls `useViewerTools(TOOLS, ...)`, merges every enabled tool into one `ToolGroupSpec` and registers it with `adapter.registerToolGroup`. Nothing else changes when a tool is added. The spec has one paint slot, so the first registered paint tool wins.

## Add an extension

1. Write the logic in `src/web/extensions/<name>.ts`. If it needs a viewer capability the interface lacks, add the method to `ViewerAdapter`, implement it in `RealViewerAdapter` and `MockViewerAdapter`, and extend `adapter.contract.test.ts`.
2. For a new kind of toolbar control, extend `ToolGroupSpec` and implement it in `viewer/autodeskTools.ts` and `MockViewerAdapter.buildToolGroup`.
3. For a panel, add `panels/<Name>.tsx` and export it from `panels/index.ts`. Add a pane to `PANES`.
4. Test with the mock adapter.
5. Run `npm run lint`, `npm run typecheck` and `npm test`, then check the page with `npm run dev:mock`.

## Add a command

Ctrl or Cmd+K opens the palette (`src/web/commands`).

- `COMMANDS.register(source, () => Command[], priority?)` adds a source. Providers run each time the palette opens and each time the query changes, so titles and `disabled` reasons are current. A command that fails reopens the palette with the error inline, reports to the Task Center and raises an error toast.
- A command has `id`, `title`, `group`, optional `keywords`, `icon`, `disabled` (a reason string), optional `keys` (for example `mod+alt+t`), optional `scope` and `run(host)`. `Command.keys` is a list of chords; the palette shows the first one beside the title. `host.openModal(id)` opens a settings window. `scope: 'viewer'` marks a command that belongs to the viewer: its unmodified keys (for example `i` or `h`) run only while the focus is in the viewer surface or on the page body, and never in a floated pane, a dialog or a text field.
- When two sources give the same id, the higher priority wins.
- A tool adds commands by overriding `ViewerTool.commands(ctx, settings)`.
- Panes contribute commands through the registry: `paneCommands(ctx)` in `layout/paneRegistry.ts` returns the generated Open/Close (`pane.toggle.<id>`) and New (`pane.new.<id>`) commands and appends each definition's `commands(ctx)` hook (`PaneDefinition.commands`), so a hook never replaces the generated entries. Hook commands with an existing id override that entry.
- The Panes menu is built from the same data: one row per pane via `paneCommandsFor`, with the Open/Close (or New) entry as the row's main action, and the remaining `layoutCommands(layout)` in the footer (workspace actions, Present, Lock, Reset; pane hook commands are already on their rows). A pane header menu offers the same hook commands for its kind, plus Settings, Rename pane…, Color tag… and the local move, float, resize, collapse and close entries. `layoutMenuEntries` in `layout/PaneMenu.tsx` turns a command into a footer entry: a toggle becomes a checked item, a disabled command keeps its reason, and selecting the entry runs `command.run(host)`.
- `CommandPalette` takes an `openModel(urn, context)` handle from `App` (it navigates to `/model/$urn`) and registers `recentModelCommands(openModel)`: the five most recent models become `model.recent.<urn>` commands in the Recent models group.
- Shortcuts (`commands/shortcuts.ts`) parse `mod`, `ctrl`/`cmd`/`meta`, `alt`/`option` and `shift` plus one key. `mod` means Ctrl on Windows and Linux and Cmd on macOS. Matching also accepts `event.code`, so a bare Option chord on macOS still runs its command. The global listener ignores editable targets and open dialogs, and it runs unmodified keys only for `scope: 'viewer'` commands in the viewer context (`isViewerContext`), so typing never triggers a viewer action.
- `commands/pins.ts` keeps up to 8 pinned command ids in `bsh.commands.pinned.v1`; pinning a ninth drops the oldest and the palette says which one. `commands/recents.ts` records the last run commands in `bsh.commands.recent.v1`. Shift+Enter in the palette pins or unpins the highlighted command.

## Settings and modals

- Add a modal: write a `ModalDefinition` and add it to `src/web/modal/registry.ts`. Each registered tool already adds its own. An optional `onClose` runs when the modal closes, for state the opener set.
- App settings (`src/web/settings/settings.ts`, key `bsh-settings-v1`, `SETTINGS_VERSION` 4) hold `theme` (`system`, `light` or `dark`), `density` (`comfortable` or `compact`), `textSize` (100, 112 or 125), `reducedMotion`, `language` (`en` or `ru`), `units` (`metric` or `imperial`), `sessionWarnMinutes` and `recentsLength`. A missing field takes its default; the named text sizes of older builds migrate to their percentage. `language` and `units` are stored only: the interface and the property formatting stay as they are until localization and unit formatting land. A blob written by a newer build is never rewritten. Each tool and pane owns the rest of its settings.
- Theme lives in app settings, not its own key. It is read and written through settings only.
- Appearance settings reach the document: `applyAppSettings` sets `data-density`, `data-text-size` and `data-reduced-motion` on `<html>`. `styles/tokens.css` turns density into the spacing, control-height and row-height scales, and text size sets the root font size with `100%`, `112%` or `125%`; the text, spacing and control tokens are rem values, so the shell and the dock grow with it. `dockTheme.css` maps the dock sizes to the same tokens. `global.css`, `panels.css`, `viewer.css`, `shell.css` and `dockTheme.css` drop decorative animation for both the system reduced-motion query and the setting.
- Settings > Defaults resets app settings or runs the palette's `layout.reset` command, so it uses the same guarded layout API as the Panes menu. Settings > Local data reads the stored keys with `settings/storageAudit.ts`, shows the use per family, and clears personal keys through `forgetPersonal()`. Resetting preferences is a separate checkbox: it removes the keys `BSH_KEYS.preference` and `BSH_PREFERENCE_PREFIXES` name, never every key in storage.
- Generated forms: `components/SettingsForm.tsx` renders a `FormDefinition` with field kinds `toggle`, `number`, `select`, `text`, `multi` and `list`.
- Pane settings live in `settings/paneSettings.ts` and `layout/instanceSettings.ts`. `settings/paneSettingsSchema.ts` maps a pane kind to a `PaneSettingsSchema` (`label`, `description`, `windowTitle`, optional `modalId`, `Body` and `onOpen`) in `PANE_SETTINGS_SCHEMA`; `paneSettingsSchema(kind)` returns `null` for a pane with no entry, and `PANE_SETTINGS_ORDER` fixes the order in Settings.
- A pane with a schema entry gets a Settings item at the top of its header menu (`PaneMenu.tsx`; the menu is reduced to Maximize and Unlock while the layout is locked). `onOpen` runs first (the summary pane clears its per-pane target this way); a `modalId` opens that registered modal, and a `Body` opens the same modal host with that body. Entries with a `modalId` also appear in Settings under Panes as a row with a Settings button, and a `Body` renders there as its own section rather than nested under Panes.
- Chart settings (`settings/ChartSettingsSection.tsx`, preference `bsh.charts.v1`) set the palette for every chart — Default keeps the per-theme palette, Okabe–Ito, Viridis and High contrast reuse the paint palettes — plus pattern fills and whether the data table starts open.
- Entries today: Documents (`tree`, `TreeSettingsForm` body), Model summary (`summary`, the summary modal) and Dashboard (`dashboard`, the dashboard modal). The viewer, Models and the user-added model-summary and properties panes have none. A chart instance stores its own dashboard view and property list; its panel settings button opens the Dashboard settings for that chart's view, so the list is editable even though the pane header has no gear.


## Persisted records

All browser storage goes through `src/web/storage.ts`. Do not call `localStorage` directly.

- `defineRecord({ key, initial, sanitize, area?, codec? })` makes a record. `read()` always sanitizes.
- `usePersisted(record)` returns `[value, update, reset]`.
- Add a key to `BSH_KEYS.personal` when it describes the user's models, layout or work. Add it to `BSH_KEYS.preference` when it is a taste setting.
- A family of keys (`defineRecordFamily`) needs a prefix in `BSH_PERSONAL_PREFIXES`.

## Saved items

`src/web/store/savedStore.ts` keeps named, user-made items in one personal record (`bsh.saved.v1`).

- An item is `{ id, kind, name, version, updatedAt, data }`. The export envelope is `bsh-saved` version 2 with a `kinds` map of per-kind versions (`savedKindVersions()`), so a file states which version of each kind it holds.
- Declare a kind with `defineSavedKind({ kind, version, label, sanitize })` (`store/savedKinds.ts`). It calls `registerSavedKind` (`store/savedKindRegistry.ts`), which validates the kind name and version and rejects a duplicate kind; a second `defineSavedKind` with the same version is tolerated and one with a different version throws. The handle has `list`, `get`, `save`, `rename`, `remove` and `move`. `useSavedKindItems(handle)` is the React list.
- A stored or imported item whose version differs from the registered one is rejected (`prepareSavedData`); there is no migration hook.
- Use `readSaved(kind)`, `upsertSaved`, `removeSaved` and `moveSaved` for the raw item shape.
- Settings has Export and Import for a `bsh-saved.json` file (imports are capped at 1 MB). Import merges by id and the newer `updatedAt` wins. An id that already exists under another kind is never merged: `upsertSaved` fails and Import counts it as rejected.
- The store budget is `MAX_TOTAL_BYTES` (4 MB) across at most `MAX_ITEMS` (500) items and `MAX_ITEM_BYTES` (100 KB) per item. Settings shows the used bytes against the budget, and a save or import that would exceed it fails with a message instead of a silent no-op.
- A store written by a newer build (a higher `SAVED_VERSION`) is read-only: reading works, and `upsertSaved`, `renameSaved`, `removeSaved`, `moveSaved` and `importSaved` fail without writing.
- Production kinds, each registered once at version 1 with a typed handle: `viewpoint` (`viewer/viewpoints.ts`, `VIEWPOINTS`), `selection-set` (`viewer/selectionSets.ts`, `SELECTION_SETS`), `dashboard-preset` (`extensions/dashboardPresets.ts`, `DASHBOARD_USER_PRESETS`), `export-preset` (`tools/excel/exportPresets.ts`, `EXPORT_PRESETS`), `summary-preset` (`extensions/summaryPresets.ts`, `SUMMARY_PRESETS`), `report-template` (`viewer/reportTemplates.ts`, `REPORT_TEMPLATES`) and `color-rules` (`extensions/colorRulePresets.ts`, `COLOR_RULE_PRESETS`). A kind that is not registered still round-trips through storage and export, but its data is not sanitized.

## Notifications

Toasts and the single polite live region share one store (`src/web/tasks/notifications.ts`).

- `notify(message, { tone, detail, duration, action })` shows a toast and announces it. `announce(message)` only updates the live region. Both are safe to call from event handlers, promises and effects.
- `NotificationHost` renders the toasts and the live region once, mounted by the Task Center and portalled to `document.body`; it is the only polite live region for outcomes. Pane-local status text must not add another.
- Position, duration and quiet mode are preferences in `bsh.notify.v1` (`NotificationSettingsSection.tsx`, mounted in Settings). Duration 0 keeps a toast until it is dismissed, and an error always stays until dismissed. Quiet mode hides toasts and still announces.
- Task outcomes are forwarded into the same live region. A toast stays for its duration, at most 5 are live and the last 50 go to history. Sign-out (`FORGET_EVENT`) clears the live toasts, the history and the live text.
- Real outcomes raise a toast: a saved viewpoint, a saved selection set, a snapshot or share result, a saved-items import result and a failed command.

## Tasks

Wrap work the user waits for in `startTask({ label, cancel?, retry? })` (`src/web/tasks/taskStore.ts`).

- Settle it with `finish`, `warn` (shown as "Done with warnings"), `fail` or `cancel`. `progress(fraction | null, detail)` updates a running task.
- The Task Center in the top bar shows Cancel for tasks that gave `cancel` and Retry for failed tasks that gave `retry`. Retry removes the failed task, so `retry` should start the new one.
- Model loads and exports report this way. For an export use `exportEntry`.
- A task outcome announces through `NotificationHost`; use `notify` for anything the user should also see as a toast.

