# Shared property data layer

Issue #12. Serves #47 (picker), #52 (streaming summary), #53 (selection scope), #64 (shared rows, refresh) and #76 (export pane).

## Intent

Summary, Dashboard and Export already read through one cache (`src/web/viewer/sharedLeafRows.ts`, used by `usePropertyRows` and `excelExport`). What is missing is everything the follow-up issues need on top of it: the set of properties a model has, reads that report progress and can be cancelled, and one definition of "which elements" (selected, visible, isolated, a single model). Today the element scope lives only in the export code, and the property list is hardcoded.

## Goals

1. Property discovery per model: `{ name, category }` entries, cached per model and invalidated with the row cache.
2. Chunked reads in the real adapter with progress (`done`, `total` per read) and cancel that stops issuing further chunks.
3. One scope module: element scope (`all`, `selected`, `visible`, `isolated`) combined with the existing model scope, used by export and available to summary and dashboard.
4. Pure data side of a property picker: group by category, search, stable order.
5. Consumers migrate one at a time with no behaviour change; existing tests stay and are adapted.

## Non-goals

- Picker UI, scope selectors in the panes, export pane (#47, #53, #76).
- Summary streaming UI, partial-data label, element caps (#52).
- Worker aggregation (#64).
- Persisting caches across reloads. The cache stays in memory and is keyed by adapter, model id and model version (a reload clears the model's entry).

## Approaches considered

A. New standalone store (module-level cache keyed by model id, own subscription system). Duplicates the existing cache and its invalidation, and every consumer would migrate at once.

B. Extend `sharedLeafRows` and the `ViewerAdapter` in place. The cache, same-tick merging, in-flight sharing and model invalidation already exist and are tested. New capabilities are optional parameters and a new adapter method. Chosen.

C. Push everything into the adapter (adapter owns cache and scope). Makes the adapter fat and the fakes in tests heavier; the cache is not viewer-specific.

## Design

### Adapter

```ts
interface ReadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ReadProgress) => void;
}
interface ReadProgress { done: number; total: number }

getLeafProperties(names, modelIds?, options?: ReadOptions): Promise<PropertyRow[]>;
discoverProperties(modelIds?, options?: ReadOptions): Promise<PropertyInfo[]>;
```

`PropertyInfo = { name: string; category: string }`.

Real adapter: ids are read in chunks of 5000 through `getBulkProperties`; before each chunk the signal is checked and an abort rejects with an `AbortError`; progress is reported after each chunk. Discovery reads every property of an evenly spread sample of at most 300 leaves (no `propFilter`) and collects the distinct `(displayCategory, displayName)` pairs. This is a documented limit: a property present on only a few elements may be missed; a full scan is deferred. Mock adapter derives discovery from its fixture.

### Cache (`sharedLeafRows`)

`readLeafRows(adapter, names, options?)` keeps its behaviour (same-tick merge, covered-in-flight sharing, settled cache, invalidation on reload or removal, never caching empty or failed reads). New:

- Each waiter may pass a signal. A waiter that aborts rejects at once with `AbortError`. The underlying read gets its own controller that aborts only when every waiter of that read has aborted, so one consumer cancelling never starves another. An aborted read is never cached.
- `onProgress` of each waiter receives the sum over the models read.
- Discovery results (`discoverLeafProperties`) are cached per model in the same per-adapter entry, so reload and removal invalidate them together with the rows.

### Scope (`src/web/viewer/propertyScope.ts`)

```ts
type ElementScope = 'all' | 'selected' | 'visible' | 'isolated';
interface PropertyScope { models: ModelScope; elements: ElementScope }
scopeElementItems(adapter, elements): Promise<ModelDbId[]>
filterByElementScope(rows, elements, items, primaryId?)
readProperties(adapter, { names, scope?, signal?, onProgress? }): Promise<PropertyRow[]>
```

`ExportScope` becomes an alias of `ElementScope`; `filterByScope` in `exportFormats.ts` re-exports `filterByElementScope`. `readProperties` composes read, model scope and element scope in the order export uses today.

### Picker data (`src/web/viewer/propertyCatalog.ts`)

`readPropertyCatalog(adapter, options)` merges discovery across visible models (distinct by name and category, with the models that have it). `groupCatalog(catalog, query)` returns `{ category, properties }[]`, filtered case-insensitively on name or category, categories and names sorted. A hook `usePropertyCatalog(adapter)` returns `{ status, catalog, reload }`.

## Consumer migration

1. Export (`excelExport`): uses `readProperties` instead of `readLeafRows` plus `scopeRows` plus `filterByScope` plus a local `scopeItems`. Same rows, same order.
2. Hook (`usePropertyRows`): passes an `AbortSignal` that aborts on cleanup (dependency change or unmount), and exposes `progress` while loading. Summary and Dashboard consume the hook unchanged.
3. Summary and Dashboard keep their model scope hook. Selecting element scope in those panes is #53.

## Deferred

Picker UI, element scope in panes, cancel button and partial results, full-model discovery, worker aggregation, persistent cache, per-model-version keys beyond the current reload invalidation.

## Verification

Unit tests for chunking, abort, progress, refcounted cancel, discovery cache invalidation, scope filters and catalog grouping against fakes. The real Autodesk viewer is covered only by fakes; the mock smoke covers the app wiring.
