# Dockable layout implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved design in `docs/superpowers/specs/2026-11-16-dockable-layout-design.md`: a dockable, user-customizable layout built on a pane registry, with the Autodesk viewer never remounted.

**Architecture:** `LayoutProvider` (in `AppShell`, signed in only) owns one detached host `div` per open pane and renders every pane body into its host with `createPortal`. Layouts only attach hosts to slots (`PaneSlot`): a dockview panel slot on wide screens, a fixed `StackedLayout` slot below 876px. React never sees a move, so no pane remounts. Dockview is imported only by `LayoutProvider.tsx` (types only) and its adapter `DockLayout.tsx`, which `LayoutProvider` lazy-loads in dock mode.

**Tech stack:** React 19, TanStack Router, `dockview-react` 8.9.0 (exact pin, peer `react ^19`), Vitest + jsdom, Camoufox e2e (Python).

## Global constraints

- `dockview-react` pinned to `8.9.0`; imported only by `src/web/layout/LayoutProvider.tsx` and `src/web/layout/DockLayout.tsx`; lazy so the landing page does not load it.
- Storage key `bsh.layout.v1`, record `{ version: 1, layout }`. Old keys `bsh.tree.width`, `bsh.summary.collapsed`, `bsh.dashboard.collapsed` are imported once and deleted.
- The viewer pane cannot be closed, has no pop-out, and is never remounted by move, tab, float, collapse or the breakpoint switch. No pop-out windows anywhere.
- Ids `#document-panel` and `#main` stay stable.
- One breakpoint: dock from 876px, `StackedLayout` up to 875px (tree as overlay). The 1000px overlay breakpoint is removed.
- DESIGN.md: no shadows or gradients, 0.5px hairlines, token radii, dark and light via `data-theme`. `viewerChrome.css` untouched.
- No code comments in any file. Commits: short conventional subject, tiny or empty body, dated 2026-11-16T12:00:00, no AI attribution, specific paths only, never push.
- `npm run lint`, `npm run typecheck`, `npm test` and the build stay green at every phase commit. The build is checked into a scratch `--outDir` until the final verification.

## Decisions not covered by the spec

- **Keyboard navigation.** Dockview 8 ships keyboard navigation and keyboard docking only in the commercial `dockview-enterprise` package. Only the free modules are used: live-region announcements (on) and floating groups. The keyboard path is the pane menu on every group header plus our own `F6` / `Shift+F6` focus cycling between panes.
- **Drag backend.** `dndStrategy: 'pointer'` for every input, so drags are pointer events (testable in Camoufox, no HTML5 drag image needed).
- **All panes use hosts.** The portal host is generic (one per pane), not just for the viewer, so the tree keeps its expanded rows across moves and the breakpoint switch.
- **The viewer pane is the main pane.** Its body is `<main id="main">` holding the route outlet (model header, empty state or not found) and, on a model route, the `ViewerPane`. `ModelPage` is now the header only. The viewer reads the URN from the router (`useParams({ strict: false })`).
- **Panes on non-model routes.** In the dock all open panes stay in place on every route; summary and dashboard show their existing "no model" empty states. In `StackedLayout`, panes with `requires: 'viewer'` are hidden off the model route.
- **Collapse** is per pane, stored in `layout.collapsed`. The panel's own collapse button and the pane menu both toggle it. In the dock a collapsed group is pinned to its header along its split axis (height for a column, width for a row) with dockview group constraints; floating groups cannot collapse.
- **Move left / right / below** move the pane to a new group at that edge of the whole dock. **Float** opens it in an in-page floating group. A floating pane offers **Dock** (back to its default placement) instead of Float.
- **Closable panes:** tree, summary and dashboard. Required: viewer. The top bar tree button opens or closes the tree pane in the dock and the overlay in the stack.
- **Mock layout API.** `window.__bshLayout` (move, float, reset, read) is exposed only when `isMockViewer()` is true, which requires `import.meta.env.DEV`, so it is not in the production bundle.

## File structure

| File | Responsibility |
|---|---|
| `src/web/layout/paneRegistry.ts` | `PaneId`, `PaneDefinition`, `PANES`, `paneById`, `isRequired` |
| `src/web/layout/panes.tsx` | The pane bodies: `TreePane`, `ViewerHost` main pane, `SummaryPane`, `DashboardPane` |
| `src/web/layout/ViewerHost.tsx` | `PaneHosts` (portals into detached hosts) and `PaneSlot` (attaches a host to a slot) |
| `src/web/layout/layoutContext.ts` | `LayoutContext`, `useLayout()`, `LayoutApi` type |
| `src/web/layout/layoutState.ts` | Reducer, `serializeLayout`, `restoreLayout`, `sanitizeDock`, `importLegacy`, `splitAxisOf` |
| `src/web/layout/defaultLayout.ts` | `defaultSteps(treeWidth)` the ordered placements of the default arrangement |
| `src/web/layout/LayoutProvider.tsx` | State, persistence, reset, mode switch, hosts, lazy `DockLayout` |
| `src/web/layout/DockLayout.tsx` | The dockview adapter: build, restore, save, menus in headers, collapse, F6 |
| `src/web/layout/StackedLayout.tsx` | Fixed stack and tree overlay below 876px |
| `src/web/layout/PaneMenu.tsx`, `LayoutMenu.tsx`, `src/web/components/Menu.tsx` | Pane header menu, top bar Panes menu, shared menu button |
| `src/web/layout/layout.css` | Dockview theme class mapping `--dv-*` to tokens, pane containers, stack |

## Phase 1: registry, provider and hosts, no visible change

### Task 1.1: pane registry
**Files:** create `layout/paneRegistry.ts`, test `layout/paneRegistry.test.ts`.
**Produces:** `type PaneId = 'tree' | 'viewer' | 'summary' | 'dashboard'`; `PaneDefinition { id; title; icon: IconName; component: ComponentType; minSize: { width; height }; defaultPlacement: Placement; closable; canFloat; requires: 'viewer' | 'none' }`; `Placement = { direction: 'left' | 'right' | 'below' | 'center'; reference?: PaneId; size?: number }`; `PANES`, `paneById(id)`, `isPaneId(value)`.
- [ ] Test: ids unique; viewer is not closable and can float; every `reference` exists and comes earlier in the list; `isPaneId` rejects unknown ids.
- [ ] Implement, run, commit.

### Task 1.2: portal hosts
**Files:** create `layout/ViewerHost.tsx`, test `layout/ViewerHost.test.tsx`; modify `viewer/ViewerPane.tsx` (+ test).
**Produces:** `PaneHosts({ open: PaneId[]; render: (id) => ReactNode; hosts: HostStore })`, `PaneSlot({ id; hosts; onAttach? })`, `createHostStore()` with `get(id): HTMLElement`; `ViewerPane` prop `resizeSignal?: number`.
- [ ] Test: a `ViewerPane` with `MockViewerAdapter` rendered through `PaneHosts`, moved from slot A to slot B and back: `destroy` not called, `load` called once, `resize` called once per move via `resizeSignal`.
- [ ] Test: `ViewerPane` no longer listens to `transitionend`.
- [ ] Implement, run, commit.

### Task 1.3: provider in AppShell, ModelPage header only
**Files:** create `layout/layoutContext.ts`, `layout/LayoutProvider.tsx`, `layout/panes.tsx`; modify `components/AppShell.tsx`, `routes/ModelPage.tsx`, tests.
- [ ] `ViewerProvider` moves into `LayoutProvider`. Panes render through hosts into a fixed classic grid that reproduces today's look.
- [ ] Update `AppShell.test.tsx` and `ModelPage.test.tsx`; all tests green; commit `feat: pane registry and portal hosts`.

## Phase 2: dockview with default layout and persistence

### Task 2.1: layout state module
**Files:** create `layout/layoutState.ts`, `layout/defaultLayout.ts`, tests.
**Produces:** `LayoutModel { dock: SerializedDock | null; collapsed: PaneId[]; treeWidth?: number }`; `layoutReducer(model, action)` with actions `dock`, `toggleCollapsed`, `setCollapsed`, `reset`; `serializeLayout(model): string`; `restoreLayout(storage): LayoutModel`; `sanitizeDock(dock): { dock; missing: PaneId[] } | null`; `splitAxisOf(dock, groupId): 'width' | 'height' | null`; `defaultSteps(treeWidth)`.
- [ ] Tests: round trip; corrupt JSON, wrong version and throwing storage fall back to the default; unknown panes dropped from the grid, floating groups and the panel map; empty leaves and branches pruned; required panes reported missing; `splitAxisOf` alternates with depth.
- [ ] Implement, run, commit.

### Task 2.2: dock adapter
**Files:** create `layout/DockLayout.tsx`, `layout/layout.css`; modify `LayoutProvider.tsx`; test `layout/DockLayout.test.tsx`.
- [ ] Lazy `DockLayout` in dock mode. Build from `defaultSteps` or `fromJSON(sanitized)`, re-add missing required panes, save `{ version: 1, layout }` on every layout change, ignore events after unmount.
- [ ] Theme class `bsh-dock` with `--dv-*` mapped to tokens.
- [ ] Tests (real dockview in jsdom with a `ResizeObserver` stub): default panes present; layout saved; restored from storage; `movePane('viewer', 'right')` does not call `destroy`.
- [ ] Commit `feat: dockview layout with persistence`.

## Phase 3: pane menus and keyboard path

### Task 3.1: menus
**Files:** create `components/Menu.tsx`, `layout/PaneMenu.tsx`, `layout/LayoutMenu.tsx`; modify `TopBar.tsx`, `DockLayout.tsx`; tests `layout/menus.test.tsx`.
- [ ] Pane menu in every group header: Move left, Move right, Move below, Float, Collapse or Expand, Close (closable only), Reset layout. Viewer has no Close.
- [ ] Top bar Panes menu: checkbox items for closable panes, Reset layout. Dock mode only.
- [ ] Tab component without a close button for the viewer.
- [ ] Tests: menu opens on Enter and ArrowDown, arrows move focus, Escape closes and restores focus, items call the layout API, the viewer menu lacks Close, the Panes menu reopens a closed pane.
- [ ] `F6` / `Shift+F6` cycle focus between groups; live region announces menu moves. Commit.

## Phase 4: floating groups

### Task 4.1: float and dock
- [ ] `floatPane(id)` with bounds inside the dock, `dockPane(id)` back to the default placement; floating theme (hairline, no shadow). Tests: floating keeps the viewer mounted, serialized `floatingGroups` restored, no `popout` anywhere. Commit.

## Phase 5: stacked fallback, migration, cleanup, docs

### Task 5.1: StackedLayout
- [ ] Below 876px: viewer (main), dashboard, summary in a column, tree as overlay with backdrop, Escape and focus return, `inert` on the column. Saved dock layout untouched and restored when wide. Test: 1440 → 800 → 1440 keeps the viewer (`destroy` not called) and the moved arrangement.

### Task 5.2: legacy import and dead code
- [ ] `importLegacy` on first run, keys deleted. Delete `useTreeWidth.ts`, the grid in `model.css`, the rail and drawer collapse rules that dockview replaces, the `OVERLAY_QUERY`. Tests updated.

### Task 5.3: e2e and docs
- [ ] `e2e/mock_smoke.py`: default layout, move via pane menu, persistence across reload, reset, stacked fallback, one pointer drag (menu or mock API fallback), viewer element not remounted.
- [ ] `e2e/smoke.py --layout`: real-APS move, canvas follows container, model still loaded, float, reset.
- [ ] Docs: `docs/layout.md`, `architecture.md`, `design-system.md`, `development.md`, README features.
- [ ] Final verification: lint, typecheck, test, `npm run build`, bundle size before/after.

## Test list

| Area | File |
|---|---|
| Registry | `layout/paneRegistry.test.ts` |
| Reducer, serialize, sanitize, migrate, legacy import, split axis | `layout/layoutState.test.ts` |
| Default steps | `layout/defaultLayout.test.ts` |
| Portal host, no destroy across moves, resize once | `layout/ViewerHost.test.tsx` |
| Dock build, save, restore, move, float | `layout/DockLayout.test.tsx` |
| Breakpoint switch, stacked overlay | `components/AppShell.test.tsx` |
| Menus and keyboard | `layout/menus.test.tsx` |
| Viewer resize signal | `viewer/ViewerPane.test.tsx` |
