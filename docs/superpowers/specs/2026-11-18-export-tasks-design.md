# Export tasks

Follows the task center design (issue #13), section "Export integration".

## Intent

The Excel/CSV/JSON/copy, GLB and IFC exports report through the task center instead of the viewer pane status badge, so progress, outcome, cancel and retry live in one place and one polite live region announces results.

## Design

- `runOnce(adapter, kind, label, run, options)` in `tools/kernel/exportKit.ts` keeps the one-running-export-per-kind lock and the swallowed rejection. It calls `startTask({ label, cancel?, retry })` before the work and hands `run` a job: `{ task, signal }`.
- `statusReporter(task, describe)` maps an export status to the task: `reading`/`building` to `progress(null, detail)`, `done` to `finish(detail)` (or `warn(detail)` when it reports `missing`, `skipped`, `levelsUnavailable` or `generatedIds`), `empty` to `finish(detail)`, `error` to `fail(detail)`, `cancelled` to `cancel()`.
- Detail text is the existing `describe*Status` output, so row counts and warnings (missing models, skipped fragments, levels unavailable, generated ids) appear in the task detail unchanged.
- A start that throws or rejects fails the task and still frees the lock.
- Retry re-runs the same export through `runOnce`.

## Cancel

- Excel export passes an `AbortSignal` to the property read and an `onProgress` fraction, so it shows a cancel button and a determinate bar. An aborted read ends as a cancelled export; a copy in flight is rejected.
- GLB and IFC read through adapter calls that cannot be aborted, so their tasks show no cancel.

## Removed

- `ToolContext.report`, `ToolBadge`, the per-tool `*Badge` helpers, `isBusy` and the `report` option of `useViewerTools`.
- The ViewerPane badge stays only for share results (`Link copied`), which are not exports.

## Accessibility

The task center owns the export announcements. The viewer status region keeps announcing share results only.
