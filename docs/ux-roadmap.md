# UX and customizability roadmap

A synthesis of nine brainstorming passes, one per feature: Documents, Viewer and tabs, Combined viewer, Model summary, Dashboard, Paint and selection, Export and sharing, Workspace and pane system, Global shell. Each pass read the code and the plans of the two branches in flight (`feat/multi-model`, `feat/combined-viewer`). API names below come from the agents' knowledge and the combined-viewer plan; each must be verified against the Autodesk docs before it is specified.

## What nearly every feature asked for

Eight of nine reports independently asked for the same seven building blocks. Build these first, once, instead of nine times.

| # | Foundation | Needed by | What it is |
|---|---|---|---|
| 1 | **Model-aware selection and viewer actions** | Summary, Dashboard, Paint, Viewer, Export, Combined, Layout | One selection type `(modelId, dbId)` and adapter methods `select`, `isolate`, `hide`, `showAll`, `fitToView`, `getState`, `restoreState`, `screenshot`. Today the adapter has only `getSelection`, `setThemingColor`, `clearThemingColors`. |
| 2 | **Command registry and palette** (Cmd/Ctrl+K) | Documents, Shell, Layout, Paint, Summary, Dashboard, Viewer, Export | Each pane kind contributes `commands()`. The palette, shortcuts, context menus and the Panes menu all read the same registry. |
| 3 | **Settings store and per-pane settings** | Shell, Layout, Documents, Summary, Dashboard, Viewer | One versioned `bsh-settings-v1` object (theme incl. system, density, text size, reduced motion, language, defaults) plus a `settingsSchema` per pane kind rendered as a gear menu. |
| 4 | **Saved things store with JSON import/export** | Summary presets, chart specs, export templates, color rules, selection sets, viewpoints, federations, workspaces | One typed store (localStorage first) behind an interface, so a server store can replace it later. Files and links are the sharing path. |
| 5 | **Shared property data layer** | Summary, Dashboard, Export, Paint, Combined | Property discovery (all names, not a fixed list), chunked reads with progress and cancel, a cache per model version, scope (all, selection, visible, model), one property picker UI. |
| 6 | **Notification and task center** | Shell, Export, Viewer, Combined | One `useNotify()` and task API replacing the viewer's private badge: progress, retry, history, one aria-live region. |
| 7 | **Dynamic pane families** | Layout, Viewer, Dashboard, Combined | The registry gets pane kinds with instances (`viewer:<urn>`, `chart:<id>`, per-model properties). `feat/multi-model` already builds the base. |

Also a **session keep-alive** (shell): an expired session currently swaps to the landing page and discards the layout and open models. Rolling the cookie and showing an inline "sign in again" banner fixes the worst current failure cheaply.

## Quick wins (small effort, high value)

| Feature | Quick win |
|---|---|
| Shell | Session keep-alive banner; system theme option, density and text size |
| Documents | Recents and Pinned strip (the data already exists); metadata columns and sort |
| Summary | Click a row to select, isolate or zoom; filters, sort, hide `(empty)`, "% empty" badge; copy as TSV |
| Dashboard | Cross-filter (click a bar to select in the viewer); PNG and CSV export; ready-made boards |
| Paint | Custom colors and intensity (it is theming intensity, not opacity); ghosting |
| Export | Copy as table and CSV; metadata sheet; "selected only" scope; **spreadsheet formula-injection guard** (element names are user data and can start with `=`, a real security gain) |
| Viewer | Deep link with camera and selection; honest load states (still processing vs failed vs no access); screenshot |
| Combined | Models pane with visibility, isolate, remove; plain-language failure explainer; "3 of 6" cost meter |
| Layout | Command palette; maximize a pane; layout lock |

## The features, in one line each, with the top three to build

- **Documents** (the main pane): fast finding in large hubs. Build Recents and Pinned, metadata columns, deep search with filters (needs a Data Management search endpoint, otherwise a bounded crawl). Later: multi-select and Open together, saved model sets, version drawer, thumbnails, hub and project switcher, drag onto the viewer.
- **Viewer and tabs**: deep link with camera and selection, then saved viewpoints; load progress and screenshot; viewer settings, a configurable toolbar profile and persisted tool state. Later: tab pin, duplicate and reopen; split compare with synced cameras; sheets and views browser; presentation mode.
- **Combined viewer**: Models pane, failure explainer, saved federations with a share link. Later: per-model color and "tint strength" (not opacity), discipline presets, alignment info and a labeled visual-only nudge, version compare (Autodesk's DiffTool support for plain files is unconfirmed).
- **Model summary**: click-to-act, filters and sort, then a property picker with saved presets. Later: quantity measures (area, volume, length sums), grouped or pivot view, streaming progress, selection scope, compare across models.
- **Dashboard**: a chart builder where every chart is a saved spec (removes today's five-property limit), cross-filter, then presets and model-health KPIs. Later: each chart as its own dockable pane, color the model by a chart, accessible palettes, compare models.
- **Paint and selection**: select and isolate from the summary, a Colors pane (color by property with a live legend), rules-based presets. Later: named selection sets (persist by Revit `externalId`, not `dbId`), undo and history, colored export, color-blind-safe palettes.
- **Export and sharing**: an Export pane (property picker, scope, preview, templates), CSV and copy with a metadata sheet, then progress and cancel for large exports. Later: formats, cell formatting, share link, screenshot and report, print styles.
- **Workspace and pane system**: command palette, named workspaces with export and import, maximize and lock. Later: Panes menu with search and descriptions, pane rename and color tag, layout undo, keyboard resize, configurable stacked order.
- **Global shell**: session keep-alive, toast and task center, a settings dialog. Later: first-run onboarding, a Help pane, accessibility audit, localization (the data has Cyrillic names), PWA metadata.

## The pane catalog that results

| Pane | Status | Notes |
|---|---|---|
| Documents | required, main pane | In flight (`feat/multi-model`) |
| Viewer tabs (one per model) | In flight | Tab title is the model name |
| Model summary, Dashboard | exist | Become scoped, configurable |
| **Models** | new, S, high | One pane, not two: the combined-viewer idea and the layout idea are the same |
| **Properties inspector** | new, M, high | Follows the active model's selection |
| **Selection sets**, **Search results** | new, M, high | Sets feed Summary, Dashboard, Paint and Export |
| **Colors and Legend** | new, M, high | One palette and one theming layer shared with the Dashboard |
| **Export** | new, M, high | Replaces the one-shot button |
| **Views and sheets**, **Saved viewpoints** | new, M | Per-model instance and a store keyed by version |
| Version history | new, M | Opens a version as a tab |
| Issues (ACC) | later, L | Needs extra scopes and ACC projects only |
| Help, Activity | later, S | |

## Build order

1. **Now (in flight):** multi-model tabs, Documents-first, combined viewer. Their reviews and merges.
2. **Wave 1, foundations:** items 1 to 6 above, plus session keep-alive.
3. **Wave 2, visible quick wins:** the table above, in this order: summary row-click and filters, Recents and Pinned, deep link and load states, Models pane and failure explainer, export copy and the formula guard, command palette, maximize and lock.
4. **Wave 3, core customizability:** workspaces, property picker and summary presets, chart builder and boards, Export pane and templates, Colors pane, viewpoints, selection sets, pane settings.
5. **Wave 4, larger:** deep search, chart-per-pane, saved federations and links, sheets browser, split compare, large-export worker, reports, version compare, localization.

## Overlaps the agents proposed twice, to reconcile now

- **Models pane** (combined viewer) and **Models list** (layout): one pane.
- **Colors pane** (paint) and **color model by chart** (dashboard): one palette and one theming layer. Decide that paint and color-by-property are separate layers with a defined priority, otherwise `setThemingColor` calls overwrite each other.
- **Saved things**: viewpoints, selection sets, federations, export templates, color rules, chart specs and summary presets are typed entries in the same store, with one export format. Workspaces carry layout and pane settings but never models.
- **Settings dialog** (shell) and **pane settings** (layout): one schema.
- **Export pane** and the Summary's copy and export: one serializer.

## Risks and things not yet verified

- Viewer API names (`getState`/`restoreState`, `isolate`, `setGhosting`, `getBulkProperties2`, `getExternalIdMapping`, `hideModel`/`showModel` argument type, `DiffTool`) and Data Management search and attribute fields are unverified.
- `dbId` is stable only within one model version. Anything saved (sets, viewpoints, rules) needs a stable key such as Revit `externalId`, or a stored version URN, and a "this may have changed" warning.
- Memory: each open model is a WebGL context; the cap is four loaded. Duplicated tabs and many panes must count against it.
- Large models (100k+ elements): reads must be chunked, cancellable and cached before the property picker, charts and export all depend on them.
- Share links work only for people who already have Autodesk access to the files.
- localStorage growth and migration for the new stores; keep each store versioned and tolerant of missing fields.

## Decisions needed from you

Merged and de-duplicated from the nine open-question lists. The first two came up in eight of nine.

1. **Where do user data live?** Browser-local with file and link sharing (assumed), or per-user server storage (needs a backend, unlocks team presets and cross-device)? Recommendation: local now, store behind one interface.
2. **Who receives shared links?** Only colleagues with Autodesk access (no backend), or stakeholders without accounts (needs a snapshot report or a backend)?
3. **Is the audience power reviewers or stakeholders?** It sets the default toolbar profile, the default summary click (select vs isolate and zoom), and whether a locked read-only "Present" workspace is the default for newcomers.
4. **Does the Colors pane replace the native toolbar paint group, or does the toolbar stay as a thin view over the same store?**
5. **Are your hubs ACC, BIM 360 or plain Fusion?** It decides search, attributes and whether ACC Issues is in scope.
6. **Quantities (area, volume sums), manual model nudge, version compare:** which of these are real requirements?
7. **Demo model and telemetry:** may first-run offer a sample model, and is "no analytics, local only" the stance?
8. **Typical model size:** must 100k+ elements work reliably, or is a warning above about 50k acceptable?
