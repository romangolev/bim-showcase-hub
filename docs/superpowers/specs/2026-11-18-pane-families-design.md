# Dynamic pane families

Issue #14.

## Intent

The registry already supports one instance family, `viewer:<urn>`, whose instances are driven by the open-models store. Other panes (summary, charts, per-model properties) need several instances too, each with a stable id, persistence and clean removal, without a static `PaneId` union per instance.

## Goals

- A family declares `instances.source`: `models` (instances follow the open-models store, today's viewer) or `user` (instances are created and closed by the user and persisted).
- User instances have ids `<kind>:<n>`, a persisted list per kind, and a title.
- Instances can be split, tabbed, floated and saved by the dock like any other pane.
- `sanitizeDock` keeps an instance id only when the provider lists it, so a stale saved layout never revives a closed instance.
- A "New ..." entry per creatable family in the Panes menu, and closing an instance removes it from the store.

## Non-goals

- Rewriting DockLayout or the stacked (mobile) layout: user instances exist in dock mode only.
- Per-instance data specs (chart configuration). Instances carry an id and title; the data layer plugs in later.
- Restoring user-instance placement when no model is open at load; they reappear once a model opens.

## Approaches

1. Make every pane a family. Large blast radius on layout persistence; rejected.
2. Separate dock sync for user families. Duplicates the viewer logic; rejected.
3. Chosen: keep one `instances` mechanism, add `source`. `syncInstances` already loops all families; user families skip viewer-only adoption and companion handling. The provider merges model panel ids and user ids into the single `instances` list that sanitize, mounting and sync already consume.

## API sketch

- `PaneInstances { component, closable, source: 'models' | 'user', creatable? }`
- `isUserFamily(kind)`, `userFamilies()`, `userInstanceId(kind, n)`
- `LayoutApi.addInstance(kind) -> PanelId`, `LayoutApi.closeInstance(id)`
- Persisted under `bsh.layout.instances.v1` as `{ [kind]: { id, title }[] }`, sanitized on read.
- A first family, `chart`, registers a Chart pane (a dashboard view) to exercise the mechanism.
