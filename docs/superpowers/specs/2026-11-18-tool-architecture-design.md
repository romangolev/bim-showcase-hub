# Tool architecture

## Intent

The viewer toolbar tools (paint, Excel export, GLB export, IFC export) are scattered over one `Settings` object, one hard-coded settings modal and one `buildToolGroupSpec` that switches on feature flags. Adding or changing a tool means editing app settings, the modal, the toolbar builder and `ViewerPane`. The app layer imports tool modules (`settings.ts` imports `extensions` and `ifc`).

The goal is one class per tool behind a shared base class, each tool owning its settings, its persisted key and its settings window, with app settings reduced to app-level fields. No user-visible behaviour changes except where the settings windows live.

## Owner's calls

These were decided before the work started and are not open questions.

1. An abstract base class `ViewerTool` defines the contract: `id`, `title`, a settings definition (defaults, sanitizer, persisted key), an `enabled` flag that lives in the tool's own settings, `contribute(...)` returning the toolbar spec entries for the adapter, and `renderSettings()` for the tool's settings window. Concrete classes: `PaintTool`, `ExcelExportTool`, `GlbExportTool`, `IfcExportTool`. Adding a tool is adding a class and registering it, with no edit to app settings or `SettingsModal`.
2. Each tool persists under its own storage key and owns its settings window. The on/off toggle moves into that window. App `Settings` keeps `sessionWarnMinutes`, `recentsLength` and any other non-tool field. The app modal shows only those plus entry points that open each tool's window, so tools stay discoverable.
3. The Summary and Dashboard panes already own settings modals. They follow the same rule: their window and keys belong to the pane, nothing in app settings. `paneSettings.ts` stays the persistence primitive instead of a parallel mechanism.
4. Saved values survive. The old `bsh-settings-v1` blob is read once, tool fields are copied to each tool's new key, the app blob is rewritten without them, and sign-out keeps clearing personal data (`forgetPersonal`, IFC author and organisation blanked). Migration tests cover corrupt and partial blobs.
5. One-way dependencies. Tools depend on a small kernel (base class, registry, settings primitives). The app shell depends on the registry only. Shared export behaviour (busy lock, file name helpers, large export confirmation) is composition, not a deep class hierarchy.
6. YAGNI. No plugin loader, no dynamic discovery, no generic form generator beyond what these tools need.

## Goals

- Open/closed: a new tool needs one class, one settings component and one `register` line.
- Single responsibility: a tool class owns its toolbar entries, its settings and its status badge text. The viewer pane only wires the registry to the adapter.
- Dependency inversion: `ViewerPane`, `SettingsModal` and the modal registry depend on the `ViewerTool` abstraction and the registry, not on `exportToXlsx`, `IfcSettings` and friends.
- Liskov: any `ViewerTool` can be registered, enabled, disabled and rendered without special cases in the shell.
- Existing control ids, tooltips, swatch ids, the per-viewer id suffix, the busy lock across re-registration and the "no re-register on IFC or Excel settings change" behaviour stay as they are.

## Non-goals

- No new tool features, no change to export code in `extensions/*Export.ts` or `ifc/`.
- No plugin loading, no tool discovery at runtime.
- No change to `ToolGroupSpec` or the adapters. `ToolGroupSpec` has a single `paint` slot, so when two tools contribute paint the first registered wins.
- Summary and dashboard panes do not become `ViewerTool` classes. They are panes, not toolbar tools. They only share the persistence primitive and the entry-point list.

## Constraints

- `localStorage` only, through `readJson` and `writeJson`. Every read stays sanitized, so a hand-edited or corrupt value falls back to defaults.
- `forgetPersonal` must keep blanking `author` and `organisation` in the IFC settings but keep every other tool value. Tool keys are therefore preferences, not entries of `BSH_KEYS.personal`, and a tool can declare a `scrub` function that sign-out calls.
- The legacy blob key is `bsh-settings-v1` (`BSH_KEYS.preference.settings`). The app blob keeps that key.
- Each commit passes typecheck, `biome check` and the tests.

## Approaches considered

1. Keep one `Settings` and add a registry of sections. Smallest diff, but app settings still hold tool fields and the app layer still imports tools. Rejected: fails call 2.
2. Interface plus plain objects (no classes). Fine technically, but the owner asked for classes with a shared base, and the base class lets `renderSettings()` wrap every tool window in the same frame (enable switch, title) once. Rejected.
3. Abstract base class, one concrete class per tool, registry in a kernel, per-tool persisted key (chosen). Tools share the frame and the enable flag through the base class and share export behaviour through plain helper functions (`exportKit`). The base class has one template method (`renderSettings` calls `renderFields`) and no other inheritance depth.
4. Generic form generator driven by a schema. Rejected as YAGNI: the four settings windows are small and different (colour palette, selects and checkboxes, free text lists, class overrides).

## Layout

```
src/web/tools/
  kernel/
    persistedSetting.ts   PersistedSetting<T>, persistedSetting(), usePersistedSetting()
    ViewerTool.tsx        abstract ViewerTool<S>, ToolSettings, ToolContext, ToolContribution, ToolBadge
    ToolSettingsFrame.tsx enable switch + heading shared by every tool window
    ToolRegistry.ts       register(), all(), get(), buildGroup(), modals(), scrubPersonal()
    useViewerTools.ts     hook: settings -> registerToolGroup, disable transitions
    exportKit.ts          runOnce, exportFileName, confirmLargeExport, isBusy, exportEntry
    migrateLegacy.ts      one-time move of tool fields out of the app blob
  paint/   PaintTool.tsx, PaintSettings.tsx
  excel/   ExcelExportTool.tsx, ExcelSettings.tsx
  glb/     GlbExportTool.tsx
  ifc/     IfcExportTool.tsx, IfcSettings.tsx
  index.ts                the default registry (TOOLS) and the forget hook
src/web/settings/
  settings.ts             app only: sessionWarnMinutes, recentsLength
  SettingsModal.tsx       Appearance, Session, Documents, and the tool and pane entry list
  toolEntries.tsx         entry rows (registry tools plus the two pane windows)
```

`paneSettings.ts` keeps `PANE_SETTINGS`; its `PaneSetting` type and `usePaneSetting` become thin aliases of the kernel primitive so the kernel does not import pane code.

Dependency direction: `tools/<name>` -> `tools/kernel` -> `storage`, `viewer/ViewerAdapter` (types), `modal/types`. `viewer/ViewerPane`, `settings/*` and `modal/registry` -> `tools/index` (the registry) and `tools/kernel` only. Export logic stays in `extensions/` and `ifc/` and depends on nothing in `tools/` or `settings/`: the defaults and sanitizers it needs (`DEFAULT_IFC_SETTINGS`, `readIfcSettings`, `readExcelSettings`) move next to the types in `ifc/` and `extensions/exportFormats.ts`.

## The base class

```
abstract class ViewerTool<S extends ToolSettings> {
  id, title, description
  settings: PersistedSetting<S>        key, initial, sanitize
  contribute(ctx, settings): ToolContribution   { paint?, exports? }
  toolbarSignature(settings): unknown  what the toolbar structure depends on (default: enabled)
  onDisabled(adapter): void            default no-op (paint resets its colours)
  scrub(settings): S                   sign-out hook (default identity; IFC blanks identity)
  legacy?: { fields, read(blob) }      where the value used to live in the app blob
  renderSettings(): ReactNode          the frame plus renderFields()
  settingsModal(): ModalDefinition
}
```

`ToolSettings` is `{ enabled: boolean }` and every tool settings type extends it. `ToolContext` gives a tool the adapter, `id(base)` (adds the per-viewer suffix), `fileName()`, `current(tool)` (the live settings, read at click time so edits to export options never re-register the toolbar) and `report(badge, busy)` for the viewer status badge.

## Migration plan

`migrateLegacySettings(registry, appKey)` runs once at start-up (`main.tsx`), before React renders. It reads `bsh-settings-v1`:

- Not parseable JSON or not an object: leave it alone; the app sanitizer falls back to defaults and no tool key is written.
- An object: for each registered tool with `legacy.fields`, if any of those fields is present and the tool key is empty, write `sanitize(legacy.read(blob))` to the tool key. Then rewrite the app blob without every legacy field of every registered tool. A second run finds no legacy fields and does nothing.
- Partial blobs migrate what exists and default the rest. A blob from before the IFC settings existed migrates the toggles only.
- An existing tool key is never overwritten, so a downgrade and upgrade cannot lose newer edits.

Mapping: `paintBrushes`, `paintPalette`, `paintIntensity` to `{ enabled, palette, intensity }`; `excelExport` and `excel` to the Excel key; `glbExport` to `{ enabled }`; `ifcExport` and `ifc` to the IFC key. Sign-out keeps working on the new IFC key through the tool's `scrub` function, registered with `onForgetPersonal` in `storage.ts`.

Order of work: kernel, then one tool at a time (paint, xlsx, glb, ifc). While tools are mid-migration the app blob still holds the fields of tools not yet moved, and the legacy fields of each migrated tool are stripped by the migration. Then the settings windows and entry list, the stripped app settings, and the docs.

## Tests

- Base class contract and registry: duplicate id or key rejected, ordering, group building (disabled tools skipped, ids suffixed, first paint wins), modals, scrub.
- Per-tool settings sanitizing (moved from `settings.test.tsx`), per-tool window tests (moved from the section tests), export wiring tests (moved from `viewerTools.test.ts`).
- Migration: full blob, partial blob, corrupt JSON, non-object JSON, idempotence, existing tool key kept, app blob rewritten without tool fields.
- Sign-out: IFC identity blanked on the new key, other tool values kept.
