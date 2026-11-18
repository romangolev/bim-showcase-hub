# Persisted records

## Intent

About fifteen modules read and write browser storage themselves through `readJson`, `writeJson` and `removeJson`, through raw `localStorage` and `sessionStorage`, or through the two pass-throughs `persistedSetting` and `usePersistedState`. Each one re-implements sanitize-with-default, and each one has to be remembered by `forgetPersonal`, which only knows the static list `BSH_KEYS.personal`.

That lack of locality causes a real bug. `seedInstanceSetting` writes a model URN under `bsh.pane.<kind>.<n>.v1`. That key is not in `BSH_KEYS.personal`, so "forget personal data" leaves it in storage, and leaves the memoised spec in the `instanceSettings` cache. A reused instance id then resurrects the old model scope. The seed also writes without a sync event, so a mounted hook only sees it through its first read.

## Goals

- One deep module owns key registration (personal vs preference, plus registered key prefixes for per-instance records), sanitize-on-read with a default, cross-hook and cross-tab sync, the forget scrub including in-memory caches, and the forget hooks used by legacy migration.
- Callers declare a record and never touch storage.
- Storage is an adapter at a seam with two real adapters: browser storage and an in-memory adapter.
- Every key string and version suffix stays byte-for-byte. A test pins the list.
- `sessionStorage` vs `localStorage` behaviour stays where it exists today.
- The pass-through modules are deleted.

## Non-goals

- No change to stored value shapes, the layout serialiser in `layoutState`, or the open-models wire format.
- No migration of `layoutState.readLayout` and `writeLayout`, which take a `Storage` and belong to the pane-lifecycle work.
- No cross-tab sync for the in-memory adapter.

## Interface sketches

### A. Record handles

```ts
const PINS = defineRecord<Pin[]>({ key, initial: [], sanitize, area?, codec? });
PINS.read(): Pin[]          // sanitize(raw) or initial
PINS.write(next): boolean   // persists and tells every mounted hook
PINS.remove(): void
PINS.has(): boolean
usePersisted(PINS): [value, update, reset]

const chart = defineRecordFamily<DashboardView, PanelId>({ prefix, keyOf, initial, sanitize });
chart.get(id): PersistedRecord<DashboardView>   // cached per key
chart.forget(id): void

forgetPersonal(); onForgetPersonal(hook);
setStorageAdapter(memoryAdapter());
```

Callers hold a typed handle. Sanitizer, default, key and area live together in one place and travel as one object.

### B. Store with string keys

```ts
persist.read(key, fallback, sanitize);
persist.write(key, value);
persist.use(key, initial, sanitize);
persist.registerPrefix('bsh.pane.');
```

This is what `readJson`, `writeJson` and `usePersistedState` already are, with a registry added. Every call site repeats the sanitizer and the default, the same pair can drift between two call sites, and a key typo is still a runtime bug.

## Choice

A. The handle bundles what must stay consistent (key, default, sanitizer, codec, area), so read and write sites cannot disagree, and the registry can derive personal vs preference from the key. B keeps the shallow shape that caused the duplication.

## Design

- `StorageAdapter` has `get`, `set`, `remove` and `keys`, each per area (`local` or `session`). `browserAdapter` reads `window.localStorage` and `window.sessionStorage` lazily and swallows blocked storage. `memoryAdapter()` backs tests. `setStorageAdapter` swaps it.
- A record is personal when its key is in `BSH_KEYS.personal` or starts with a prefix in `BSH_PERSONAL_PREFIXES`. Everything else is a preference. The lists are static so a lazily loaded module cannot be missed by forget.
- `forgetPersonal` removes the static personal keys and every stored key under a personal prefix in both areas, drops every family cache, runs the forget hooks, then fires `FORGET_EVENT`. Mounted hooks reset personal records to their default and re-read preference records.
- `write` notifies subscribers of that key (in a microtask) only when the browser accepted the write, so a list never shows an item that was not saved. `usePersisted`'s `update` is the one exception: when the write is rejected (private mode, full storage) it keeps the value in memory and notifies mounted hooks, so settings still work for the session.
- A codec option stores raw strings where the format is not JSON today (theme, owner, open models, saved items wrapper).

## Caller migration

1. Tool kernel: `persistedSetting` and `usePersistedSetting` go away, tools declare records. `ToolRegistry` and `migrateLegacy` use the record API.
2. Pane and instance settings, with the forget fix.
3. Stores: saved items, recent models, recent commands, hub hint, hidden models, app settings.
4. Theme and open models (owner and session list).
5. `LayoutProvider` and pins move to records. `usePersistedState`, `readJson`, `writeJson`, `removeJson` are deleted.

Each step is its own green commit.

## Risks

- Existing users' data: keys, version suffixes and value formats do not change, and the pin test guards the list.
- `usePaneSetting` and `PaneSetting` stay exported from `paneSettings` as aliases so panel code owned by other work does not change.
- `createOpenModelsStore` takes a record-like store instead of a `Storage`, so its tests change mechanically.
- `layoutState` still takes a `Storage`, so the layout key is the one place that bypasses the adapter. It is still scrubbed by forget.
