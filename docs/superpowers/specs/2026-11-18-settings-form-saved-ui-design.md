# Settings form renderer, saved items import/export, dashboard presets

Closes the leftovers of #10, the UI half of #11 and the user-saved part of #59.

## Settings form renderer

`src/web/components/SettingsForm.tsx` renders a declarative `FormDefinition`: an optional title and intro, a list of fields and an optional reset button. Field kinds: `toggle`, `number` (integer input, or a slider with `slider: true`), `select`, `text`, `multi` (checkbox group) and `list` (editable string list, text or colour items, min and max length).

The component is controlled: it takes `value` and reports `onChange(patch)`. It knows nothing about tools or panes, so the app shell and both sides can use it.

`ViewerTool` gains an optional `form` definition. When present, the default `renderFields` renders it against the tool's persisted setting. Paint migrates onto it. The Summary pane window migrates too, composing its two persisted settings into one value and routing each patch back. Dashboard, Excel and IFC keep their hand-written windows. GLB has no fields beyond the enable switch.

Out of scope: theme, density, text size, reduced motion, language (#101).

## Saved items import and export

A "Saved items" section in the app settings modal entries area, built on the existing `savedStore` API. Export downloads `exportSaved()` as JSON. Import reads a chosen file and calls `importSaved`, then shows the outcome in a status line: accepted and rejected counts, or the error (size cap, not JSON, wrong format, newer version). The section shows the stored item count per kind. It holds no tool settings.

## Dashboard presets

User presets are saved items of kind `dashboard-preset` holding the sanitized `DashboardView`. A "My presets" block inside the dashboard settings window lets the user save the current board under a name, apply, rename and delete. Applying runs the stored data through `sanitizeDashboardView`. Built-in presets stay read-only.
