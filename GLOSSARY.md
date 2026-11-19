# Glossary

- **Layout**: the arrangement of panes on screen, a `LayoutModel` (`src/web/layout/layoutState.ts`) that is persisted and applied through `layoutApply.ts`.
- **Workspace**: a saved, named layout plus its pane appearances (`bsh.workspaces.v1`), with JSON import and export and a `#layout=` share link.
- **Preset**: a built-in workspace (`PRESETS` in `workspaces.ts`) given as layout steps rather than a stored layout. It cannot be edited or deleted.
- **Pane**: one dock panel from `paneRegistry.ts`. Documents is the only required pane; chart, model summary and properties panes can have several instances.
- **Incoming link**: a `?view=` link that is opened in the address. `viewer/incomingLink.ts` decodes it once, restores panes, charts, camera, selection and hidden or isolated elements, and clears it from the address. Outgoing links are built by `shareLink.ts`.
- **Selection set**: a saved set of elements across models, identified by stable external id where the model has one and by `{ modelId, dbId }` otherwise. It is brought back as a selection or used as a scope (`set:<id>`); `viewer/setResolution.ts` resolves it against the open models.
- **Scope**: which elements a property read covers, the model scope (`ALL_MODELS` or one model) plus the element scope (`all`, `selected`, `visible`, `isolated` or `set:<id>`, `viewer/propertyScope.ts`). A deleted set falls back to `all`.
