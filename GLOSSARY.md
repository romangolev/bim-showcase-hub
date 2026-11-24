# Glossary

- **Layout**: the arrangement of panes on screen, a `LayoutModel` (`src/web/layout/layoutState.ts`) that is persisted and applied through `layoutApply.ts`.
- **Workspace**: a saved, named layout plus its pane appearances (`bsh.workspaces.v1`), with JSON import and export and a `#layout=` share link.
- **Preset**: a built-in workspace (`PRESETS` in `workspaces.ts`) given as layout steps rather than a stored layout. It cannot be edited or deleted.
- **Summary preset**: a saved or built-in Model summary setup (row properties plus the summary view, including its columns), saved kind `summary-preset`. Not a layout Preset; it is managed only in Summary settings.
- **Summary column**: one user-defined number per summary row, a property with an aggregate (count, filled %, empty %, distinct, sum, average, minimum, maximum) or the element count.
- **Pane**: one dock panel from `paneRegistry.ts`. Documents is the only required pane; chart, model summary and properties panes can have several instances.
- **Incoming link**: a `?view=` link that is opened in the address. `viewer/incomingLink.ts` decodes it once, restores panes, charts, camera, selection and hidden or isolated elements, and clears it from the address. Outgoing links are built by `shareLink.ts`.
- **Coloring**: the one data colouring per viewer (by property, by chart or by rules) with its legend. `viewer/modelColoring.ts` owns it: applying, clearing, the legend's hidden groups and the ghosting claim of **Ghost the rest**. A viewer is coloured exactly when it holds a Coloring. It writes the `chart` source of `viewer/colorLayers.ts`; paint stays above it and the model tint below.
- **Selection set**: a saved set of elements across models, identified by stable external id where the model has one and by `{ modelId, dbId }` otherwise. It is brought back as a selection or used as a scope (`set:<id>`); `viewer/setResolution.ts` resolves it against the open models.
- **Scope**: which elements a property read covers, the model scope (`ALL_MODELS` or one model) plus the element scope (`all`, `selected`, `visible`, `isolated` or `set:<id>`, `viewer/propertyScope.ts`). A deleted set falls back to `all`.
- **Latest version**: the version with the highest number, marked by the server (`latest`), never inferred from list order.
- **Model set**: a saved, ordered list of model versions that opens as tabs or one combined viewer; members follow their pinned version or the latest one.
- **Deep search**: a bounded crawl of one project's folders that fills the Documents registry, so the filter and its chips cover files in folders never expanded.
