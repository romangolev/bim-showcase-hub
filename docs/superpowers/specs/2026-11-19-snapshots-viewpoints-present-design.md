# Snapshots, viewpoints and presentation

Issue #35, with the slice of #26 it needs. Today the Share menu copies or saves a canvas screenshot and Present hides the chrome (dock mode only).

## Snapshot options

`getScreenshot(width?, height?)` on the adapter. Autodesk `viewer.getScreenShot(w, h, cb, overlayRenderer)` (Viewer v7 reference, checked with context7) returns a Blob URL asynchronously: with `0, 0` the canvas size, with a width and height "the resized image". The callback is the third argument, which the adapter already uses. The mock adapter draws its SVG at the requested size. Without arguments both keep today's behaviour (the pane size).

Options are a persisted preference record `bsh.snapshot.v1`: `resolution` (`1x`, `2x`, `custom`), `customWidth` (320 to 8192), `overlay` (boolean) and `advanceSeconds` (Present auto-advance, 0 is off, up to 120). They live in a "Snapshots and presentation" section of the Settings modal because they belong to the Share menu and to Present, which are neither a tool nor a pane. They are preferences, not personal data, so they survive sign-out.

The target size is the pane size times 1 or 2, or the custom width with the pane's aspect ratio. A side above 8192 px or more than 30 megapixels is refused before capture with a visible error that names the size and the limit. The overlay is a caption (model name, version, date) drawn by the app in a canvas on the returned PNG, because the Autodesk capture holds the canvas only. Copy and Save both use the same path.

## Viewpoints

Saved items of kind `viewpoint` on the saved store; `data` is `{ state: ViewerState }` from `adapter.getState()`. The store already sanitizes, caps (500 items, 100 kB each, so an oversized state fails to save with a message) and clears on forget, because `bsh.saved.v1` is personal. `moveSaved(id, delta)` reorders an item among items of its kind.

Restore uses `adapter.restoreState()`. A viewpoint whose models are all closed does nothing and reports "Open <model> to use this viewpoint" style text; with some models open it restores what it can. Nothing throws.

UI: the Share menu gets "Save viewpoint", up to ten "Go to <name>" entries, "Manage viewpoints..." (a modal with rename, move up and down, delete) and "Present". Palette: "Save viewpoint" and "Go to viewpoint <name>". No thumbnails, links or sections (#26).

## Present

- Keys in Present: ArrowRight and Space go to the next viewpoint, ArrowLeft to the previous; keys typed in inputs and menus are left alone.
- A discreet indicator "2 / 5" (announced as "Viewpoint 2 of 5: name" in a polite live region) sits next to the exit button; with no viewpoints there is only the exit button.
- Auto-advance runs every `advanceSeconds` while presenting and restarts after a manual step.
- Narrow layouts have no Panes menu, so the Share menu's Present entry is the way in. CSS hides the tree, model tabs and other panes in the stacked column and gives the viewer the screen.
- The lifecycle remembers which pane was maximized before Present. On exit it un-maximizes the viewer and maximizes that pane again. A user-maximized viewer (a `viewer:<urn>` instance) is left maximized.
