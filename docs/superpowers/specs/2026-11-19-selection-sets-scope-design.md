# Selection sets as an export and summary scope

Issue #77 (export scope), using the smallest slice of #69 (named selection sets).

## Selection sets

A set is a saved item of kind `selection-set` in the saved store (`bsh.saved.v1`, personal, so sign-out removes it). `data.models` maps a model id (its URN) to the dbIds captured from `adapter.getModelSelection()`. Reading back validates the shape, drops non-integer ids and duplicates, and caps a set at 10,000 elements; saving a larger selection fails visibly instead of truncating. Sets can be saved, renamed, deleted and selected into the viewer with `selectModelIds`. Sets from rules, set algebra, colours and a stable `externalId` key stay in #69.

UI: a "Selection sets" section in the Excel export settings window, a "Save selection as set" command and one "Select set <name>" command per set in the palette.

## Set scope

`ElementScope` gains `set:<id>`. It flows through the one shared path: `sanitizeElementScope`, `scopeElementItems` (the set's items), `filterByElementScope` and `applyScope`, so the model scope still applies when a set spans several models. The scope select lists existing sets. A deleted or stale set falls back to all elements with a visible notice: the select shows "Deleted set (using all elements)", and the export finishes as "Done with warnings" saying so. The Excel tool scrub resets a `set:` scope to all on sign-out because the sets are gone.

## Live count

The Excel settings window shows "Rows to export: N". Rule: the count comes from the shared per-adapter row cache only (`peekLeafRows`), regardless of property names, because a count needs row identity, not values. If any model that the scope needs has no cached rows the count is unknown: the window shows "counting…", re-checks once a second and on selection and model changes, and never starts a read. With a cached read the count is `applyScope(rows, scope, items)`, the same function the export uses, so the large-export confirm (over 20,000 rows) sees the same number.
