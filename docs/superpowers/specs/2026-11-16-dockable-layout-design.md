# Dockable layout design

Status: sections 1 and 2 approved by the user. Section 3 is proposed and not yet approved.

## Goal

Let users rearrange the app UI freely: move, resize, tab, split, collapse and float panes, including the Autodesk viewer. The mechanism is universal: any pane, current or future, plugs in through a registry instead of being hard-coded in CSS.

## Decisions

| Topic | Decision |
|---|---|
| Layout model | IDE-style docking: tabs, splits, and floating panels inside the page |
| Pop-out windows | Out of scope. Floating stays in the same tab |
| Persistence | One global layout per browser in `localStorage` key `bsh.layout.v1`, with a Reset layout action |
| Dock scope | The whole app, including the document tree. The layout moves up into `AppShell`, and `ViewerProvider` moves up with it |
| Narrow screens | Below about 876px the dock is off and a fixed stacked layout is shown with the tree as an overlay. The saved dock layout is kept for wide screens |
| Library | `dockview-react`, pinned to an exact version, imported only by `LayoutProvider`, lazy-loaded so the landing page does not pay about 100KB gzipped |
| Viewer lifecycle | The viewer is rendered once through a portal into a detached `ViewerHost` div and is never remounted. It cannot be closed and its pop-out is disabled |

## Current state

- `routes/router.tsx` renders `AppShell` at the root. `/model/$urn` lazy-loads `ModelPage`.
- `AppShell.tsx` owns the top bar, the tree open state and its overlay mode below 1000px, and `TreeControlContext`. The tree (`TreePanel`) lives outside the model route and resizes through `useTreeWidth` (`--tree-width`, 260 to 480px).
- `ModelPage.tsx` owns `ViewerProvider`, the header, and the grid children `.model-viewer`, `.model-dashboard` and `aside.model-summary`, plus their collapsed states and storage.
- `styles/model.css` and `panels/panels.css` implement the layout as a CSS grid with container queries on `main`. The 876px threshold is duplicated in both files.
- `ViewerPane.tsx` creates the adapter in an effect keyed by `[urn, factory, tools, publish, attempt]`. Unmounting calls `destroy()`, so a remount reloads the model. Resize is driven by a `ResizeObserver` on the host, a `transitionend` listener on `.model-page`, a window `resize` listener, and `adapter.resize()`.
- Local storage keys today: `bsh.tree.width`, `bsh.summary.collapsed`, `bsh.dashboard.collapsed`, `bsh-theme`, `bsh.models.recent`.

## Section 1: structure and the viewer host (approved)

New folder `src/web/layout/`, one job per file:

- `paneRegistry.ts`: pane definitions. Each has `id`, `title`, `icon`, `component`, `minSize`, `defaultPlacement`, `closable`, `canFloat`, and `requires` (`'viewer'` or `'none'`). The initial panes are tree, viewer, model summary and dashboard. A new pane is one more entry.
- `LayoutProvider.tsx`: holds the dock layout, persistence, migration and reset. It exposes `useLayout()` with `movePane`, `togglePane`, `resetLayout` and `focusPane`. It is the only file that imports dockview.
- `ViewerHost.tsx`: creates one detached `div` and renders `ViewerPane` into it through `createPortal`. The viewer's dock panel only attaches that div to its slot. React never sees the move, so the viewer survives dragging, tab switches and the breakpoint switch.
- `defaultLayout.ts`: the starting arrangement, matching today's look: tree left, viewer centre, summary right, dashboard below the viewer.
- `StackedLayout.tsx`: the fixed layout below about 876px, built from the same registry. The viewer host is re-attached there.

Changes to existing code:

- `ViewerProvider` moves from `ModelPage` to `AppShell`, so every pane can reach the viewer.
- `ModelPage` becomes the header plus route data, delivered through context. `AppShell` stops laying out the tree itself.
- `useTreeWidth` and the hand-written grid CSS are replaced by the dock. The duplicated 876px threshold becomes a single value.
- Each pane body becomes its own container (`container-type: inline-size`), replacing the single `main` container for container queries.
- The `ViewerPane` `transitionend` listener on `.model-page` is removed. The `ResizeObserver` plus one explicit `adapter.resize()` after any move replaces it.

## Section 2: behavior (approved)

Moving panes:

- Drag a pane's tab or title bar to dock it left, right, above or below any group, onto a group to make a tab, or outside to float it.
- Floating panels stay inside the page.
- The viewer can be moved, tabbed and floated. It cannot be closed and its pop-out is disabled.

Without dragging:

- Each pane header has a menu: Move left, Move right, Move below, Float, Collapse, Reset layout. Every drag action has a keyboard path.
- Dockview's keyboard navigation and live-region announcements are enabled for screen readers. Their quality is verified in the real build during implementation.
- The ids `#document-panel` and `#main` stay stable so the skip link and the tree's `reveal()` keep working.

Saving and restoring:

- The layout is saved as `{ version, layout }` under `bsh.layout.v1` on every change.
- On load the layout is restored in a try/catch. Unknown pane ids are dropped, and required panes that are missing are added back at their default position. A corrupt or older-version layout falls back to the default layout.
- On first run the existing `bsh.tree.width`, `bsh.summary.collapsed` and `bsh.dashboard.collapsed` values are imported once into the first saved layout, then removed.
- Reset layout is in the top bar menu.

Narrow screens:

- Below about 876px the dock is off and the same panes show in a fixed stack, with the tree as an overlay. The old 1000px tree overlay breakpoint goes away: between 876px and 999px the tree is a normal docked pane. The saved dock layout is kept and restored when the window is wide again.

Theming:

- Dockview's `--dv-*` variables are mapped to our tokens in one theme class, so dark and light follow `data-theme`.
- DESIGN.md rules apply: no shadows or gradients, 0.5px hairlines, tightened radii.
- `viewerChrome.css` is scoped to `.bsh-viewer-surface` and is unaffected by moving the host.

## Section 3: testing, rollout and risks (proposed, not yet approved)

Testing:

- Unit tests: the pane registry, the layout reducer, serialize and migrate (including corrupt and old-version input), and the portal host, asserting that `adapter.destroy` is not called across a move using `MockViewerAdapter`. jsdom has no layout, so dockview's drag and drop is not unit-tested.
- Camoufox e2e (the only browser used in this repo): drive dockview's pointer backend with mouse down, move and up. As a fallback, expose the layout API in mock mode and call it through `main_world_eval` and the `mw:` prefix.
- Live real-viewer check with the signed-in profile: after moving the viewer between groups and into a floating panel, the model is still loaded, the canvas follows its container, and the paint and export tools still work.

Rollout in phases, each shippable:

1. Registry, `LayoutProvider` and `ViewerHost`, reproducing the current layout with no visible change.
2. Dockview with the default layout and persistence.
3. Pane menus and the keyboard path.
4. Floating groups.
5. Stacked fallback, migration of old keys, and documentation.

Risks:

- Moving the Autodesk canvas's DOM node is untested. A canvas keeps its WebGL context, but this is not verified with Autodesk. The first phase includes a live check before building on it.
- Dockview has a history of major-version API changes. The version is pinned and the library is wrapped behind `LayoutProvider`.
- About 100KB gzipped. It is lazy-loaded so the landing page does not pay for it.
- The tree's virtualization measures 0 inside hidden tabs. The tree stays rendered so it re-measures, or its expanded state is held outside the component.
- Camoufox's handling of drag and drop through Playwright is unverified, hence the pointer backend and the mock-mode layout API fallback.

Open questions, with the default taken if not changed:

- Should closed non-required panes (summary, dashboard) be re-openable from a menu? Default: yes, from a Panes menu in the top bar.
- Should the layout be per browser only, or synced to the signed-in user? Default: per browser only.

## Out of scope

- Pop-out windows.
- Per-model layouts.
- Named layout presets.
- Layout customization on narrow screens.
- A free dashboard grid.
