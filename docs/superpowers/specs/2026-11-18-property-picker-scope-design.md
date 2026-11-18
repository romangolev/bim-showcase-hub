# Property picker, element scope and read progress for the summary

Issues #47, #53, #52. Builds on `2026-11-18-property-data-layer-design.md`.

## Scope

1. `PropertyPicker`: a searchable, categorized list fed by `usePropertyCatalog` and `groupCatalog`. Keyboard accessible (search field, native checkboxes in category fieldsets), shows which properties are chosen. Chosen properties not in the catalog stay visible and removable. Used by Summary settings; the chosen names are a persisted pane setting `summary.properties` (default: the three current properties, never empty).
2. Element scope in the Summary pane: `all`, `selected`, `visible`, `isolated`, a persisted pane setting `summary.scope`, chosen in the pane header next to the model scope. Rows are read once for all elements (shared cache) and filtered with `filterByElementScope`; the item list is re-read on selection change (debounced) and on model change. A label states the scope and the honest counts ("Summarizing 12 of 4,310 elements").
3. Progress and cancel: the pane renders the hook's `progress` as a progress bar with a Cancel button. Cancel aborts the read and ends in a `cancelled` state; the previous rows stay shown under a "Partial data" label, or a retry block when there were none. Models without readable properties keep their existing notice, and the same label applies.

## Non-goals

Dashboard picker and scope (Dashboard has presets that define its properties), streaming partial counts mid-read (reads settle per read, not per chunk), element caps, worker aggregation, full-model discovery.

## Verification

Vitest for the picker, setting sanitizer, scope label and cancel state; mock smoke checks the picker and scope select. The real Autodesk viewer is covered only by fakes.
