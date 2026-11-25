# UX roadmap

Planned work lives in GitHub issues, tracked by [#108](https://github.com/romangolev/bim-showcase-hub/issues/108). This page groups the remaining items by area. Shipped work is not listed.

## Planned by area

| Area | Items | Status |
|---|---|---|
| Documents | Deep search with filters (#18), multi-select in Documents and Open together (#19), saved model sets (#20), context menu and keyboard map for the tree (#21), version drawer (#22), thumbnails (#23), hub and project switcher (#24), home view and drag a file onto the viewer (#25) | Shipped |
| Viewer and tabs | Viewpoints: saved views (#26), configurable toolbar (#28), viewer settings panel (#29), persist tool state (#30), tab pin, duplicate and reopen (#31), split compare with synced cameras (#32), sheets and views browser (#33) | Shipped, except deferred #31 and dropped #32 |
| Combined viewer | Per-model colors and ghosting (#37), saved federations (#38, later removed), discipline presets (#40), alignment info and nudge (#42), per-model scope everywhere (#43), version compare (#44) | Shipped, except dropped #40, #42 and #44 |
| Summary | Property picker with discovery (#47), grouped and pivot view (#49), quantity measures (#50), saved presets (#51), streaming load (#52), pinned properties and cross-model compare (#55) | Shipped, except deferred #52 and dropped #55 |
| Dashboard | Chart builder with saved specs (#57), model health KPIs (#60), color the model by a chart (#61), chart accessibility (#63), large-model performance (#64), compare models (#65) | Shipped, except dropped #65 |
| Paint and selection | Colors pane and paint by property (#67), rules-based presets (#68), named selection sets (#69), undo and history (#71), ghosting modes (#72), color column in export (#73), color-blind-safe palettes (#74), hotkeys (#75) | Shipped |
| Export and sharing | Export pane (#76), column presets (#78), large exports with cancel and a worker (#80), cell formatting and totals (#82), share view link (#83), printable report (#84) | Shipped, except deferred #80 |
| Workspace | Named workspaces (#86), export and import a layout (#89), Panes menu v2 (#90), pane rename and color tag (#91), layout undo (#92), auto-switch rules (#93), onboarding hints and configurable stacked layout (#94) | Shipped, except dropped #93 |
| New panes | Search results (#96), version history (#97, later removed), ACC Issues (#98), measurements (#99), activity log and Help (#100) | Shipped, except dropped #98 |
| Shell | Settings dialog for density, text size and language (#101), first-run onboarding (#102), top bar breadcrumb, search and help (#103), accessibility pass (#104), localization (#105), narrow-screen polish and PWA metadata (#106) | Shipped |

## Constraints for new work

- `dbId` is stable only within one model version. Saved data needs a stable key such as the Revit `externalId`, or a stored version URN.
- Each loaded model is a WebGL context. New tabs and panes must count against the loaded-model budget.
- Reads on large models (100k+ elements) are chunked (5,000), cancellable and cached. The 100k path is proven structurally; real wall-clock timing on a 100k-element model remains a live-model check before changing `READ_CHUNK` or adding a warning threshold.
- Paint and color-by-property need a defined layer priority, or `setThemingColor` calls overwrite each other.
- Share links only work for people who already have Autodesk access to the files.
- Keep every new store versioned and tolerant of missing fields.

## Open questions

1. Browser-local user data with file sharing (the current choice), or per-user server storage?
2. Resolved: shared links stay for people who already have Autodesk access. Public sharing is skipped for now, and the Share menu and this page say so.
3. Resolved: 100k discovery is chunked, cancellable and cached. Real latency stays a live-model check, and no new warning threshold is added.
