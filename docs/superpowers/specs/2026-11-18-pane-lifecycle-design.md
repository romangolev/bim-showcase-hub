# Pane lifecycle module

## Intent

`LayoutProvider.tsx` (812 lines) holds the pane lifecycle in refs and effects (`modelsRef`, `userStateRef`, `lockedRef`, `floatPending`, `attachedRef`, `shown`, `presentMaximized`) around well-tested pure reducers. The bugs sit in that untested orchestration, and tab and instance flows can only be exercised by mounting dockview.

Deliver one deep module, `paneLifecycle.ts`, whose interface is commands plus derived state and which knows nothing of React or dockview. `LayoutProvider` becomes an adapter: it wires the module to React (`useSyncExternalStore`), the open-models store, persisted values and the dock controller.

## Goals

- One place for: add and close instances (lowest free number, cap 12 per kind, settings seed and forget), model tab activate and close, open/close/toggle of panes, move, reset, lock, maximize, present, resize, tree overlay, float-next, attach and release of mounted panes, announcements.
- The refs disappear: the module state is the single source, commands read it directly.
- Pure reducers (`layoutState`, `dockOps`, `userInstances`, `mounted`) stay as internals.
- Tab and instance flows are tested at the module interface with fakes, without mounting dockview.
- No behaviour change: persisted keys, id rules, user panes restored at home, stacked-mode handling and present mode are kept.

## Non-goals

- Rewriting `DockLayout.tsx` or `StackedLayout.tsx`.
- Changing storage access; persisted values reach the module through ports, so the persisted-record work lands independently.
- DOM key listeners (resize arrows, Escape) and focus restore on mode switch stay in the adapter; they call module commands.

## Two interface sketches

### A. Command store with injected ports

```ts
createPaneLifecycle(deps): PaneLifecycle
deps = { models, dock(), mode(), hosts, persist, settings, focus, later, title, initial }
PaneLifecycle = {
  subscribe, getState, view(): View,
  openPane/togglePane/closePane/activateInstance/closeInstance/addInstance,
  movePane/resetLayout/setLocked/setCollapsed/toggleMaximize/setPresenting,
  toggleTree/revealTree/closeTreeOverlay/floatNext/startResize/resize/finishResize,
  attached/visibility/dockChanged/treeWidth/maximizedChanged/moved,
  reconcile(), sync(external), modeChanged()
}
```

Commands mutate internal state and call the ports synchronously. Tests pass fakes and read `getState`/`view`.

### B. Pure transition function with effect list

```ts
transition(state, event, ctx): { state, effects: Effect[] }
```

The adapter interprets effects (`dock.move`, `models.close`, `persist.user`, `focus.pane`, `announce`). Every flow is testable as data in and data out.

## Choice

A. B makes the seam wide: every dock and store call becomes an `Effect` variant plus an interpreter in the adapter, so the interface a caller learns is larger than the logic it hides, and two adapters (`DockLayout`, `StackedLayout`) would each need effect handling. A keeps the interface to named commands, and the seam is the three ports a test fakes (dock controller, open-models store, persistence). Ordering such as "float after attach, one frame later" lives inside the module.

## Derived state

`view()` returns instances, companions, home, treeOpen, overlayOpen, canAddInstance, mounted panes and user panels, computed by a pure function of module state, the open-models state and mode.

## Migration order

1. This spec.
2. Add `paneLifecycle.ts` with module-level tests. Nothing uses it yet.
3. Switch `LayoutProvider` to the module and delete the refs.

## Risks

- Dockview is async and lazy: the controller is null until the dock mounts. Commands treat a missing controller as a no-op, as today, and `floatNext` queues until the pane attaches.
- Focus and a11y behaviour is hard to pin. The focus calls stay one-for-one behind a `focus` port, and the component tests plus the mock smoke are the safety net.
- Module state updates synchronously while React renders later; `useSyncExternalStore` keeps them consistent, and persisted values changed from outside (other tab, forget) enter through `sync`.
