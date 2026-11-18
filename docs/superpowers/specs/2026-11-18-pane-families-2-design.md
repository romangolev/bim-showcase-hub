# Pane families, part 2

Issue #14, leftovers of `2026-11-18-pane-families-design.md`.

## Goals

- Each `chart` instance owns its data spec (property, chart kind, model scope, preset), persisted with the instance.
- A per-model summary family (`modelSummary`) lets the user add a summary pane pinned to one model.
- User instances are restored when no model is open at load.
- The stacked layout shows user instances after the built-in sections.

## Design

- A per-instance spec is a `persistedSetting` (the pane-setting primitive) keyed `bsh.pane.<kind>.<n>.v1`, cached by key so its identity stays stable for `usePaneSetting`. Closing an instance removes its key. Keys are not personal keys, so "forget my data" leaves them; they are layout state like `bsh.layout.instances.v1`.
- Chart spec: `DashboardView` plus an optional `scope` (a model id). `DashboardPanel` takes an optional `setting` and a controlled scope; the global Dashboard keeps its own setting and session scope.
- `modelSummary` spec: `{ scope }`, defaulting to the active model when the pane is created. It reuses `ModelSummaryPanel` with a controlled scope. A scope whose model is no longer open falls back to all models (existing `resolveScope`).
- Ids stay `<kind>:<n>`, capped at 12 per kind like every user family.
- No model open at load: user ids join `instances` in dock mode regardless of the model count, so `sanitizeDock` keeps their placement. Panes show their existing empty states. Creating one still needs an open model. `buildDefault` treats only model instances as "open".
- Stacked layout: user instances render as sections below the built-in stack, only while a model is open. Creating them stays dock-only; instances made in dock mode show in stacked mode.

## Non-goals

- A properties family: there is no properties pane to instantiate yet.
- Rewriting `DockLayout.tsx`.
