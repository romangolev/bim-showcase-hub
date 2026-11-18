# Extensions

An extension is a small module in `src/web/extensions` that works against the `ViewerAdapter` interface ([architecture.md](architecture.md#vieweradapter)), plus an optional React panel in `src/web/panels`. Modules never touch Autodesk Viewer globals, so they run on the real and the mock adapter and can be tested without a browser viewer.

## Structure

- `src/web/extensions/<name>.ts`: pure logic. Takes an adapter or `PropertyRow[]`.
- `src/web/extensions/index.ts`: re-exports each module.
- `src/web/panels/<Name>.tsx`: the UI. Gets the adapter from `useViewer()` (through `useResolvedAdapter`) and reads properties with `useScopedRows`.
- `src/web/panels/index.ts`: exports the panel. A pane entry in `paneRegistry.ts` places it ([layout.md](layout.md#add-a-pane)).
- Tests: `extensions/extensions.test.ts` and `panels/panels.test.tsx`.

A property row is `{ dbId, name, properties, modelId?, modelName? }`. In a combined view dbIds repeat across models, so never key data by `dbId` alone. Use `scopeRows` from `viewer/modelScope.ts` to show one model. A model whose properties failed has `propertiesError`: show `unavailableModels(adapter.getModels())` beside partial results.

Read rows with `useScopedRows` in panels and `readScopedRows` in async code, never `readLeafRows` directly ([architecture.md](architecture.md#scoped-rows)). Render states with `StateBlock`.

## Built in

| Extension | Where | Notes |
|---|---|---|
| Viewer tools | `tools/` | `PaintTool`, `ExcelExportTool`, `GlbExportTool`, `IfcExportTool`, registered in `tools/index.ts` |
| Paint | `paintBrushes.ts`, `tools/paint/` | Up to 8 swatches and an intensity. Paints per `(modelId, dbId)` |
| Model summary | `modelSummary.ts`, `panels/ModelSummaryPanel.tsx` | Counts values per property. Row click selects, isolates, hides or zooms |
| Dashboard | `dashboardData.ts`, `panels/DashboardPanel.tsx` | Chart.js bar and doughnut charts, presets, PNG, CSV and copy |
| Excel export | `excelExport.ts`, `exportFormats.ts` | XLSX, CSV, JSON or copy. Cells starting with `=`, `+`, `-` or `@` are guarded in CSV and copied text |
| GLB export | `glbExport.ts`, `viewer/viewerGeometry.ts` | Binary glTF 2.0 from `adapter.getGeometryParts()`. Capped at 256 MB |
| IFC export | `ifcExport.ts`, `ifc/` | IFC4 STEP file from `adapter.getIfcSource()`. A mesh-based coordination view, not a Revit IFC export |
| Properties | `panels/PropertiesPanel.tsx` | Read-only property list of the selected elements |
| Selection sets, viewpoints | `viewer/selectionSets.ts`, `viewer/viewpoints.ts` | Saved items of kind `selection-set` and `viewpoint` |

Exports over 20,000 rows ask for confirmation with a browser dialog. End-to-end scripts must accept dialogs.

## Add a tool

A tool is a viewer toolbar entry with its own settings window.

1. Write the logic in `src/web/extensions/<name>.ts`.
2. Add `src/web/tools/<id>/<Name>Tool.tsx`, a class extending `ViewerTool<Settings>`:
   - Set `id`, `title`, `description` and `settings`: a `defineRecord` under `bsh.tool.<id>.v1`, with `enabled: readEnabled(raw)` in the sanitizer.
   - Implement `contribute(ctx, settings)` to return toolbar entries.
   - For options, set `form` (a `FormDefinition`) or override `renderFields()`.
   - For exports, use `exportEntry`, `exportStem`, `exportFileName`, `confirmLargeExport` and `statusReporter` from `tools/kernel/exportKit.ts`. Set `exportTitle` to get a palette command.
   - `ctx.current(this)` returns the settings run through the record's sanitizer, so an export never sees a field the user has just cleared. Storage keeps the raw text while the field is edited.
   - Override `toolbarSignature`, `onDisabled` and `scrub` only when needed. `scrub` blanks personal text on sign-out. If the scrubbed write fails, the record is removed.
3. Register it in `src/web/tools/index.ts` with `.register(new YourTool())`. The registry rejects duplicate ids and settings keys.
4. Test the class with a fake `ToolContext` (see `tools/glb/GlbExportTool.test.tsx`).

`ViewerPane` calls `useViewerTools(TOOLS, ...)`, merges every enabled tool into one `ToolGroupSpec` and registers it with `adapter.registerToolGroup`. Nothing else changes when a tool is added. The spec has one paint slot, so the first registered paint tool wins.

## Add an extension

1. Write the logic in `src/web/extensions/<name>.ts`. If it needs a viewer capability the interface lacks, add the method to `ViewerAdapter`, implement it in `RealViewerAdapter` and `MockViewerAdapter`, and extend `adapter.contract.test.ts`.
2. Export it from `extensions/index.ts`.
3. For a new kind of toolbar control, extend `ToolGroupSpec` and implement it in `viewer/autodeskTools.ts` and `MockViewerAdapter.buildToolGroup`.
4. For a panel, add `panels/<Name>.tsx` and export it from `panels/index.ts`. Add a pane to `PANES`.
5. Test with the mock adapter.
6. Run `npm run lint`, `npm run typecheck` and `npm test`, then check the page with `npm run dev:mock`.

## Add a command

Ctrl or Cmd+K opens the palette (`src/web/commands`).

- `COMMANDS.register(source, () => Command[], priority?)` adds a source. Providers run each time the palette opens and each time the query changes, so titles and `disabled` reasons are current. A command that fails reopens the palette with the error inline, reports to the Task Center and raises an error toast.
- A command has `id`, `title`, `group`, optional `keywords`, `icon` and `disabled` (a reason string), optional `keys` (for example `mod+alt+t`) and `run(host)`. `host.openModal(id)` opens a settings window.
- When two sources give the same id, the higher priority wins.
- A tool adds commands by overriding `ViewerTool.commands(ctx, settings)`.
- Panes contribute commands through the registry: `paneCommands(ctx)` in `layout/paneRegistry.ts` returns the generated Open/Close and New commands and appends each definition's `commands(ctx)` hook, so a hook never replaces the generated entries. Hook commands with an existing id override that entry.
- Shortcuts (`commands/shortcuts.ts`) parse `mod`, `ctrl`/`cmd`/`meta`, `alt`/`option` and `shift` plus one key. `mod` means Ctrl on Windows and Linux and Cmd on macOS. Matching also accepts `event.code`, so a bare Option chord on macOS still runs its command. The global listener ignores editable targets, open dialogs and key presses without a modifier.
- `commands/pins.ts` keeps up to 8 pinned command ids in `bsh.commands.pinned.v1`; pinning a ninth drops the oldest and the palette says which one. `commands/recents.ts` records the last run commands in `bsh.commands.recent.v1`. Shift+Enter in the palette pins or unpins the highlighted command.

## Settings and modals

- Add a modal: write a `ModalDefinition` and add it to `src/web/modal/registry.ts`. Each registered tool already adds its own. An optional `onClose` runs when the modal closes, for state the opener set.
- App settings (`src/web/settings/settings.ts`, key `bsh-settings-v1`, `SETTINGS_VERSION` 2) hold `sessionWarnMinutes`, `recentsLength`, `density`, `textSize`, `reducedMotion` and `language`; the Language switch is hidden until there is a second language. A blob written by a newer build is never rewritten. Each tool and pane owns the rest of its settings.
- Appearance settings reach the document: `applyAppSettings` sets `data-density`, `data-text-size` and `data-reduced-motion` on `<html>`. `styles/tokens.css` turns density into the spacing, control-height and row-height scales and text size into the `--text-*` scale; `global.css`, `panels.css`, `viewer.css`, `shell.css` and `dockTheme.css` drop decorative animation for both the system reduced-motion query and the setting.
- Generated forms: `components/SettingsForm.tsx` renders a `FormDefinition` with field kinds `toggle`, `number`, `select`, `text`, `multi` and `list`.
- Pane settings live in `settings/paneSettings.ts` and `layout/instanceSettings.ts`. `settings/paneSettingsSchema.ts` lists the panes that show a form or an entry point in the Settings window; a pane with a `Body` renders as its own section, not nested under Panes.


## Persisted records

All browser storage goes through `src/web/storage.ts`. Do not call `localStorage` directly.

- `defineRecord({ key, initial, sanitize, area?, codec? })` makes a record. `read()` always sanitizes.
- `usePersisted(record)` returns `[value, update, reset]`.
- Add a key to `BSH_KEYS.personal` when it describes the user's models, layout or work. Add it to `BSH_KEYS.preference` when it is a taste setting.
- A family of keys (`defineRecordFamily`) needs a prefix in `BSH_PERSONAL_PREFIXES`.

## Saved items

`src/web/store/savedStore.ts` keeps named, user-made items in one personal record (`bsh.saved.v1`).

- An item is `{ id, kind, name, version, updatedAt, data }`. The export envelope is `bsh-saved` version 2 with per-kind versions (`savedKindVersions()`).
- Declare a kind with `defineSavedKind({ kind, version, label, sanitize, migrate? })` (`store/savedKinds.ts`). It registers the kind, applies migrations on write and returns a handle with `list`, `get`, `save`, `rename`, `remove` and `move`. `useSavedKindItems(handle)` is the React list.
- A kind version bump requires a `migrate(data, fromVersion)`; a stored item is migrated when it is read for a write, so an older build never strips newer data (`prepareSavedData`).
- Use `readSaved(kind)`, `upsertSaved`, `removeSaved` and `moveSaved` for the raw item shape.
- Settings has Export and Import for a `bsh-saved.json` file. Import merges by id and the newer `updatedAt` wins. An id that already exists under another kind is never merged: `upsertSaved` fails and Import counts it as rejected.
- The store budget is `MAX_TOTAL_BYTES` (4 MB) across at most `MAX_ITEMS` (500) items and `MAX_ITEM_BYTES` (100 KB) per item. Settings shows the used bytes against the budget, and a save or import that would exceed it fails with a message instead of a silent no-op.
- A store written by a newer build (a higher `SAVED_VERSION`) is read-only: reading works, and `upsertSaved`, `renameSaved`, `removeSaved`, `moveSaved` and `importSaved` fail without writing.
- Kinds today: `dashboard-preset`, `selection-set`, `viewpoint`.

## Notifications

Toasts and the single polite live region share one store (`src/web/tasks/notifications.ts`).

- `notify(message, { tone, detail, duration, action })` shows a toast and announces it. `announce(message)` only updates the live region. Both are safe to call from event handlers, promises and effects.
- `useNotify()` returns the bound `notify`, `dismiss` and `clear` for components. `NotificationHost` renders the toasts and the live region once, inside the Task Center; it is the only polite live region for outcomes. Pane-local status text must not add another.
- Position, duration and quiet mode are preferences in `bsh.notify.v1` (`NotificationSettingsSection.tsx`, mounted in Settings). Quiet mode hides toasts and still announces.
- Task outcomes are forwarded into the same live region. A toast stays for its duration, errors stay until dismissed, at most 5 are live and the last 50 go to history. Sign-out (`FORGET_EVENT`) clears the live toasts, the history and the live text.
- Real outcomes raise a toast: a saved viewpoint, a saved selection set, a snapshot or share result, a saved-items import result and a failed command.

## Tasks

Wrap work the user waits for in `startTask({ label, cancel?, retry? })` (`src/web/tasks/taskStore.ts`).

- Settle it with `finish`, `warn` (shown as "Done with warnings"), `fail` or `cancel`. `progress(fraction | null, detail)` updates a running task.
- The Task Center in the top bar shows Cancel for tasks that gave `cancel` and Retry for failed tasks that gave `retry`. Retry removes the failed task, so `retry` should start the new one.
- Model loads and exports report this way. For an export use `exportEntry`.
- A task outcome announces through `NotificationHost`; use `notify` for anything the user should also see as a toast.

