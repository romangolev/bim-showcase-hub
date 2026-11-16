# Document tree refresh and modal scaffolding

## Goals

1. A refresh button for the document tree.
2. A modal paradigm: a blocking dialog that hosts a feature's UI. Settings is the first modal. Future features (for example IFC batch export) plug in without changing the host.

Out of scope: coordination tree node, IFC, BCF, saved data. Each has its own research file in `docs/research/` and gets its own spec.

## 1. Refresh button

- An icon button in the document panel header, next to the filter, owned by `TreePanel`.
- `DocumentTree` exposes `refreshAll`. It runs the existing per-node `refresh(id)` for the root and every folder that is currently loaded. Expansion state is kept and unloaded folders stay untouched.
- While running the button is disabled and shows a spinner. Failures reuse the existing per-node error row with Retry.
- Tests: refetches loaded nodes, leaves unloaded nodes alone, disabled while pending.

## 2. Modal scaffolding

Registry of modal definitions, rendered by one host. Folder `src/web/modal/`.

- `types.ts`: `ModalDefinition { id: string; title: string; size: 'sm' | 'md' | 'lg'; Body: ComponentType<{ close: () => void }> }`.
- `ModalProvider` and `useModal()` returning `{ open(id), close() }`. One open modal at a time. Unknown ids are ignored.
- `ModalHost`: native `<dialog>` with `showModal()`. The browser provides the focus trap, Escape, inert background and backdrop. Focus returns to the trigger on close. The host renders a header (title and close button) and the `Body`.
- `registry.ts`: a plain array of definitions. A new feature adds one file and one line here.
- Not built: stacked modals, route-linked modals, animations, confirm/prompt helpers.
- Tests: open and close, Escape, focus return, unknown id ignored.

## 3. Settings modal

Opened from `UserMenu` (a "Settings" item above Sign out). Sections:

- **Appearance**: theme switch, using the existing theme context. The top bar toggle stays.
- **Experimental features**: one switch per feature, each with a short description. Initial switches:
  - Paint brushes (the paint tool in the viewer toolbar)
  - Excel export (the export tool in the viewer toolbar)
  New switches are added to the settings schema and to this section. If more option kinds appear, the section can split.

Settings store, `src/web/settings/`:

- A typed schema with defaults, persisted in `localStorage` under one versioned key, read through `useSyncExternalStore`. Storage failures fall back to defaults.
- Both experimental switches default to on, so current behaviour does not change.
- `buildToolGroupSpec` takes the enabled features. The `paint` and `export` fields of `ToolGroupSpec` become optional, and the real Autodesk extension and the mock adapter skip absent controls. `ViewerPane` re-registers the group when the settings change.
- Tests: schema defaults and corrupt storage, toggling persists, a disabled feature is absent from the tool group on both adapters.

## Docs

Update `docs/architecture.md` or `docs/extensions.md` with how to add a modal and a setting.
