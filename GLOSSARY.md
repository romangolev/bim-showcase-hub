# Glossary

- **Layout**: the arrangement of panes on screen, a `LayoutModel` (`src/web/layout/layoutState.ts`) that is persisted and applied through `layoutApply.ts`.
- **Workspace**: a saved, named layout plus its pane appearances (`bsh.workspaces.v1`), with JSON import and export and a `#layout=` share link.
- **Preset**: a built-in workspace (`PRESETS` in `workspaces.ts`) given as layout steps rather than a stored layout. It cannot be edited or deleted.
- **Pane**: one dock panel from `paneRegistry.ts`. Documents is the only required pane; chart, model summary and properties panes can have several instances.
- **Incoming link**: a `?view=` link that is opened in the address. `viewer/incomingLink.ts` decodes it once, restores panes, charts, camera, selection and hidden or isolated elements, and clears it from the address. Outgoing links are built by `shareLink.ts`.
- **Selection set**: a saved list of `{ modelId, dbId }` elements a user can bring back or use as a scope (`set:<id>`).
- **Scope**: which elements a property read covers: `all`, `selected`, `visible`, `isolated` or `set:<id>` (`viewer/propertyScope.ts`), applied together with the model scope.
