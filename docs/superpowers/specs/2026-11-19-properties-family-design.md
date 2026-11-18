# Properties pane family and user pane placement

Issue #14 (dynamic pane families). The Properties pane is the minimal slice of #95: read-only, no editing, pinning or comparison.

## Properties family

- Registry: kind `properties`, instances `properties:N`, `source: 'user'`, `creatable`, capped at 12 like `chart` and `modelSummary`. Created from the Panes menu (`New properties`) and the command palette; both are driven by the registry.
- Spec: `{ scope: string }`, a model id, persisted per instance under `bsh.pane.properties.<n>.v1` through the `bsh.pane.` record family. Seeded with the active model when the pane is created. Removed on close and on forget (`forgetInstanceSetting` forgets every family).
- Adapter read: `getElementProperties(item: {modelId, dbId}): Promise<ElementProperties | null>`, where `ElementProperties` is `{ dbId, name, properties: { category, name, value }[] }`. Real: `model.getBulkProperties([dbId], {})` on the model handle (no `propFilter` returns every non-hidden property with its `displayCategory`). Mock: fixture values from `elementProperties`. An unknown model or element resolves to `null`.
- Panel: follows `adapter.onSelectionChange`, keeps the selected elements of the pane's model, reads them (first 20, with a "+N more" note), groups by category, filters by a search box (name, value or category) and copies a value with a button per row. States: `No model loaded`, `Select an element`, loading and error.
- Sanitize: `sanitizeUserInstances` drops ids whose family does not match the key, duplicates, non-user families and unknown kinds; tests cover all three families including a stale `properties` id.

## Placement bug

When the first model opens after the home view, `syncInstances` calls `adopt`, which rebuilds the whole dock from `lastViewerArrangement` with `fromJSON`. That snapshot predates what happened at home, so a user pane (`chart:1`, ...) the user moved or floated at home is not in it at that place and is re-added at its default placement.

Fix at the root: the remembered arrangement is only a template for a dock with nothing of the user's making. When the live dock already holds user panes, adoption is skipped and the model tab is added into the live dock, so user panes keep their place across the first model opening, reload (the dock is saved) and closing then reopening models.
