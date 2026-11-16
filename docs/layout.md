# Layout

The signed-in app is a dock: every part of the screen is a pane that can be moved, resized, tabbed, collapsed, floated inside the page and, except for the viewer, closed. The design is in [superpowers/specs/2026-11-16-dockable-layout-design.md](superpowers/specs/2026-11-16-dockable-layout-design.md).

## Pieces

Everything lives in `src/web/layout`.

| File | Job |
|---|---|
| `paneRegistry.ts` | The list of panes (`PANES`) and their rules |
| `panes.tsx` | The pane bodies: tree, main (route content and viewer), summary, dashboard |
| `layoutContext.ts` | `PaneTitleContext`: routes publish a pane title (`label`, `tooltip`) with `usePaneTitle()`. The dock applies it with `panel.api.setTitle` and shows the tooltip on the tab; the stack shows it as the viewer section label. Without a title the registry title (`Viewer`) is used |
| `ViewerHost.tsx` | `PaneHosts` renders each open pane once into a detached host `div` with `createPortal`. `PaneSlot` attaches a host to a slot |
| `LayoutProvider.tsx` | State, persistence, reset, the dock or stacked switch, the top bar, `useLayout()` |
| `DockLayout.tsx` | The dockview adapter. The only file that imports `dockview-react`, loaded lazily |
| `StackedLayout.tsx` | The fixed stack below 876px, with the tree as an overlay |
| `layoutState.ts` | Reducer, serialize, parse, sanitize, the old key import |
| `defaultLayout.ts` | The default arrangement as ordered steps |
| `PaneMenu.tsx` | The pane header menu, the collapse button and the top bar Panes menu |
| `dockTheme.css` | The `bsh-dock` theme: dockview `--dv-*` variables mapped to our tokens |

Layouts never render pane content. They only attach host elements to slots, so React never sees a move and nothing remounts when a pane is dragged, tabbed, floated, collapsed, or when the window crosses the 876px breakpoint. A pane is unmounted only when it is closed. The Autodesk viewer is never destroyed by a layout change; it is destroyed only when its route changes or the app signs out.

A pane's portal is rendered only after its host was attached once, so the viewer always starts inside the document. After every move the viewer gets one explicit `adapter.resize()` through `ViewerPane`'s `resizeSignal`, on top of its `ResizeObserver`.

## Add a pane

1. Write the body in `panes.tsx` (or its own file). Use `useLayout()` for collapse state and `useViewer()` for the adapter. Give the body one root element; the slot around it is a `pane` size container, so use `@container pane (...)` for responsive rules.
2. Add an entry to `PANES` in `paneRegistry.ts`:

```ts
{
  id: 'issues',
  title: 'Issues',
  icon: 'alert',
  component: IssuesPane,
  minSize: { width: 280, height: 160 },
  defaultPlacement: { kind: 'beside', reference: 'summary', direction: 'below', size: 240 },
  closable: true,
  canFloat: true,
  requires: 'viewer',
}
```

3. Add the id to the `PaneId` union. If it should appear in the stacked layout, add it to `STACK_ORDER` in `StackedLayout.tsx`.
4. Nothing else changes: the default layout, the menus, the Panes menu, persistence and the stack read the registry.

Fields:

| Field | Meaning |
|---|---|
| `defaultPlacement` | `root` (the first pane), `beside` a reference pane (`left`, `right`, `below`) or at an `edge` of the dock, with a size in px. Root comes first, then `beside` in registry order, then `edge`. When a reopened pane's reference is closed it goes to the dock edge in the same direction |
| `minSize` | Minimum width and height of the pane's group |
| `closable` | `false` makes the pane required: no close button, no Close item, re-added if a saved layout lost it |
| `canFloat` | Offers Float in the pane menu |
| `requires` | `'viewer'` hides the pane in the stacked layout outside the model route |

## Persistence

One layout per browser in `localStorage` under `bsh.layout.v1`:

```json
{ "version": 1, "layout": { "dock": { "grid": {}, "panels": {} }, "collapsed": ["summary"], "treeWidth": 320 } }
```

- `dock` is dockview's `toJSON()` output, or `null` before the dock was first shown.
- `collapsed` lists collapsed panes.
- `treeWidth` is used only when the default layout is built.

It is written on every layout change. On load the record is parsed in a try/catch. A corrupt record, another `version`, or a dock without any known pane falls back to the default layout. Unknown pane ids are dropped from the grid, tabs and floating groups, empty groups and branches are pruned, popout groups are removed, and required panes that are missing are added back at their default position.

On the first run (no `bsh.layout.v1`) the old keys are imported once and deleted: `bsh.tree.width` becomes `treeWidth`, `bsh.summary.collapsed=1` collapses the summary, and `bsh.dashboard.collapsed` collapses the dashboard (without a stored choice the dashboard starts collapsed on windows shorter than 900px, as before).

## Reset

Reset layout is in every pane menu and in the top bar Panes menu. It drops the saved dock and rebuilds the default arrangement without remounting any pane.

## Keyboard and screen readers

- Every pane header has a collapse button and a menu: Move left, Move right, Move below (to that edge of the dock), Float or Dock, Collapse or Expand, Close (closable panes only), Reset layout. Every drag has a menu path.
- The Panes menu in the top bar reopens closed panes (checkbox items) and resets the layout.
- `F6` and `Shift+F6` move focus between pane groups. Tabs use dockview's `tablist` and roving `tabindex`.
- After a move, focus goes to the moved pane's tab.
- dockview's live region announces open, close, float and dock; the layout's own live region announces moves, collapse and reset. Announcements are muted while a layout is restored or reset.

dockview 8 ships its keyboard navigation and keyboard docking only in the commercial `dockview-enterprise` package, so those are not used; the menus and `F6` are the keyboard path.

## Narrow screens

Below 876px (`STACKED_QUERY`) the dock is not rendered. `StackedLayout` shows main, dashboard and summary in a column with the tree as an overlay (backdrop, `inert` column, Escape and focus return to the top bar button). The saved dock is untouched and comes back when the window is wide again. The layout cannot be customized on narrow screens.

## Limits

- No pop-out windows, only in-page floating groups.
- One layout per browser, not per model and not synced to the account.
- No named presets.
- Window resizes are shared proportionally between groups. Opening, closing, collapsing and expanding keep the other groups' sizes and give the difference to the viewer.

## Testing

- Unit tests (Vitest, jsdom, real dockview with a no-op `ResizeObserver`): `paneRegistry.test.ts`, `layoutState.test.ts`, `defaultLayout.test.ts`, `ViewerHost.test.tsx`, `LayoutProvider.test.tsx`, `StackedLayout.test.tsx`, `menus.test.tsx`, `floating.test.ts`. They assert that `MockViewerAdapter.destroy` is never called and `load` runs once across moves, floating, collapse, reset and the breakpoint switch.
- In mock mode only (`import.meta.env.DEV` and the mock viewer), `window.__bshLayout` exposes `movePane`, `togglePane`, `setCollapsed`, `resetLayout`, `openPanes`, `location`, `mode` and `read`. It is not in a production build.
- `e2e/mock_smoke.py` checks the layout in Camoufox, including one real pointer drag. `e2e/smoke.py --layout` checks the real Autodesk viewer.
