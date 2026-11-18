# Scoped rows

## Intent

Property rows reach their callers through three different paths. `ModelSummaryPanel` chains `usePropertyRows`, `useModelScope` and `useElementScope`. `DashboardPanel` chains the first two and stops, so it has no element scope. Excel export uses a separate async path (`readProperties` -> `readLeafRows` -> `resolveScope` -> `scopeElementItems`). `filterByElementScope` is exposed three ways (the element hook, `readProperties`, and the `filterByScope` re-export in `exportFormats.ts`). A scope change touches four files, and the Summary and Dashboard scope behaviour already drift.

The deletion test says `usePropertyRows`, `useModelScope` and `useElementScope` are shallow: each is a few lines over the next, and the complexity (cache, filters, failure policy) reappears in every caller.

## Goals

- One deep module that takes adapter, property names and scope (models, elements) and returns rows plus status.
- It owns model filtering, element filtering, the failure policy, cancel and refresh. It keeps using the shared cache and batching of `readLeafRows`.
- Summary, Dashboard and Excel export become callers. Dashboard gains element scope.
- `filterByScope` in `exportFormats.ts` disappears.

## Non-goals

- No change to the `ViewerAdapter` interface (another change splits it).
- No change to `readLeafRows` abort and waiter semantics, the 150 ms selection debounce, the cancelled partial-data label, or the persisted summary scope key.
- No new UI beyond an element scope select in the Dashboard header.

## Two interface sketches

### A. Hook plus async function, one pure core

```ts
readScopedRows(adapter, { names, scope?, onFailure?: 'throw' | 'report', signal?, onProgress? })
  : Promise<{ rows: PropertyRow[]; total: number; failed: string[] }>

useScopedRows(adapter, { names, elements, models? })
  : { status, rows, total, pending, failed, progress, models, reload, cancel }
```

Both share `applyScope(rows, scope, items, primaryId)` and the read/failure code. The hook reads all visible models once (cached) and filters in a memo, so changing a scope never re-reads or flashes `loading`. Export calls the async function.

### B. One controller object

```ts
const rows = createScopedRows(adapter, { names });
rows.setScope({ models, elements });
rows.subscribe(listener); rows.cancel(); rows.refresh(); rows.snapshot();
```

A framework-free store; the hook is `useSyncExternalStore` over it and export calls `await rows.settled()`.

## Choice

A. B has the same depth but adds a lifecycle (subscribe, dispose, snapshot identity) that React already gives us, and export would have to build a store to read once. A has two entries (async and hook) but both are thin over the same `applyScope` and the same read function, and the seam is the existing `ViewerAdapter` (Real and Mock adapters satisfy it, so it is a real seam). Tests cross the interface with `MockViewerAdapter`.

## Migration

- Core: `readScopedRows` and `applyScope` in `viewer/propertyScope.ts`, replacing `readProperties`. `onFailure: 'throw'` (export default) rejects when a model fails to read, except models already flagged `propertiesError`. `'report'` returns the failed names for the panel notice.
- Export: `excelExport.ts` calls `readScopedRows`. `exportFormats.ts` drops the `filterByScope` re-export and its test duplicate.
- Hook: `panels/useScopedRows.ts` replaces `usePropertyRows`, `useModelScope` and `useElementScope`. `ModelScope.tsx` and `ElementScope.tsx` keep only their selects and notices.
- Summary passes `elements` from `PANE_SETTINGS.summary.scope`, controlled model scope as before. `reload` bumps the element refresh too, so the panel loses its `refreshTick`.
- Dashboard passes `view.elements` (new optional field of `DashboardView`, sanitized) and renders `ElementScopeSelect`.

## Tests

- `sharedLeafRows.test.ts`, the pure scope tests and `modelSet.contract.test.ts` survive unchanged.
- `usePropertyRows.test.tsx` becomes `useScopedRows.test.tsx` (progress, cancel, unmount, partial failure, scope filters without re-read).
- `propertyScope.test.ts` covers `readScopedRows` (both policies). The `filterByScope` test in `exportFormats.test.ts` is deleted as a duplicate.
- Panel tests that only exercise scope plumbing move to the hook test; panel tests keep UI behaviour. A Dashboard element scope test is added.

## Risks

- Hook state shape changes for every panel consumer; mitigated by typecheck and the panel tests.
- `total` and the cancelled label previously used unscoped rows; they now use model-scoped rows (`total`), which matches what the user sees.
- The real Autodesk viewer is covered only by fakes.
