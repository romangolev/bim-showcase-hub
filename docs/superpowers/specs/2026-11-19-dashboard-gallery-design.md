# Dashboard preset gallery

Issue #59. Built-in presets and the user's saved presets become cards in the Dashboard pane itself.

## Gallery

`DashboardGallery` renders a list (`role="list"`, name "Dashboard presets") of cards, built-ins first, then My presets. A card shows the name, a "Built-in" or "Mine" tag, the properties it charts and a small bar and doughnut preview per property. No model data is needed.

- Apply is the primary button on every card and applies the preset to the pane's own view (`setView`), so chart panes (`chart:N`) work the same.
- Built-in cards are read-only: no rename, no delete, a "Save as my preset" button instead.
- User cards can be applied, renamed (inline field, commit on blur or Enter) and deleted. They read and write the saved store (`dashboard-preset`), like the settings window.
- With a model open, a card whose properties are all absent from it is marked "Not in this model".
- Tab order is the DOM order; every control has an accessible name that includes the preset name.

## Where it shows

- Pane header: a Presets toggle (`aria-expanded`) opens the gallery above the board.
- Empty state: with no model open, or when the active preset has no chart left, the gallery is shown without the toggle, under the empty message, so Apply is the call to action.

## Absent properties

A preset's charts are `presetCharts(preset, rows)`: only properties with at least one non-empty value in the scoped rows. The panel reads the preset properties on top of its own. A preset with no chart left shows "Nothing to chart here" plus the gallery. Tests cover a Navisworks-like model without Level, Category or Classification.

## Out of scope

Presets stay chart specs of the existing `DashboardView`; no new preset fields, no per-card live thumbnails.
