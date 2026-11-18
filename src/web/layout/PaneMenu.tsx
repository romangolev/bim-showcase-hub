import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { type LayoutApi, useLayout } from './layoutContext.js';
import {
  definitionOf,
  isPanelClosable,
  PANES,
  type PanelId,
} from './paneRegistry.js';

export const RESET_LAYOUT_DESCRIPTION =
  'Resets the arrangement. Open models stay open; remembered viewer position and closed panes are cleared.';

export function paneMenuEntries(layout: LayoutApi, pane: PanelId): MenuEntry[] {
  const definition = definitionOf(pane);
  const kind = definition.id;
  const floating = layout.location(pane) === 'floating';
  const collapsed = layout.isCollapsed(kind);
  const lockEntry: MenuEntry = {
    id: 'lock',
    label: layout.locked ? 'Unlock layout' : 'Lock layout',
    onSelect: () => layout.setLocked(!layout.locked),
  };
  const maximized = layout.maximized === pane;
  const maximizeEntry: MenuEntry = {
    id: 'maximize',
    label: maximized ? 'Restore' : 'Maximize',
    disabled: !maximized && floating,
    onSelect: () => layout.toggleMaximize(pane),
  };
  if (layout.locked)
    return [maximizeEntry, { kind: 'separator', id: 'sep' }, lockEntry];
  const entries: MenuEntry[] = [
    {
      id: 'left',
      label: 'Move left',
      onSelect: () => layout.movePane(pane, 'left'),
    },
    {
      id: 'right',
      label: 'Move right',
      onSelect: () => layout.movePane(pane, 'right'),
    },
    {
      id: 'below',
      label: 'Move below',
      onSelect: () => layout.movePane(pane, 'below'),
    },
    maximizeEntry,
  ];
  if (definition.canFloat) {
    entries.push(
      floating
        ? {
            id: 'dock',
            label: 'Dock',
            onSelect: () => layout.movePane(pane, 'dock'),
          }
        : {
            id: 'float',
            label: 'Float',
            onSelect: () => layout.movePane(pane, 'float'),
          },
    );
  }
  if (!floating) {
    entries.push({
      id: 'resize',
      label: 'Resize with arrow keys',
      onSelect: () => layout.startResize(pane),
    });
    entries.push({
      id: 'collapse',
      label: collapsed ? 'Expand' : 'Collapse',
      onSelect: () => layout.setCollapsed(kind, !collapsed),
    });
  }
  if (isPanelClosable(pane)) {
    entries.push({
      id: 'close',
      label: 'Close',
      onSelect: () => layout.togglePane(pane),
    });
  }
  entries.push({ kind: 'separator', id: 'sep' }, lockEntry, {
    id: 'reset',
    label: 'Reset layout',
    description: RESET_LAYOUT_DESCRIPTION,
    onSelect: layout.resetLayout,
  });
  return entries;
}

export function PaneMenu({ pane }: { pane: PanelId }) {
  const layout = useLayout();
  const title = layout.paneTitle(pane).label;
  return (
    <Menu
      label={`${title} pane options`}
      trigger={<Icon name="more" size={16} />}
      triggerClassName="dock-action"
      items={() => paneMenuEntries(layout, pane)}
    />
  );
}

export function CollapseAction({ pane }: { pane: PanelId }) {
  const layout = useLayout();
  if (layout.locked || layout.location(pane) === 'floating') return null;
  const kind = definitionOf(pane).id;
  const collapsed = layout.isCollapsed(kind);
  const label = `${collapsed ? 'Expand' : 'Collapse'} ${layout.paneTitle(pane).label}`;
  return (
    <button
      type="button"
      className="dock-action"
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      onClick={() => layout.setCollapsed(kind, !collapsed)}
    >
      <Icon
        name="chevron"
        size={14}
        className="dock-action__chevron"
        data-expanded={!collapsed}
      />
    </button>
  );
}

export function PaneActions({ pane }: { pane: PanelId }) {
  return (
    <>
      <CollapseAction pane={pane} />
      <PaneMenu pane={pane} />
    </>
  );
}

export function layoutMenuEntries(layout: LayoutApi): MenuEntry[] {
  return [
    ...PANES.filter((pane) => pane.closable && !pane.instances).map((pane) => ({
      id: pane.id,
      label: pane.title,
      icon: pane.icon,
      checked: layout.isOpen(pane.id),
      disabled: layout.locked,
      onSelect: () => layout.togglePane(pane.id),
    })),
    ...PANES.filter((pane) => pane.instances?.creatable).map((pane) => ({
      id: `new-${pane.id}`,
      label: `New ${pane.title.toLowerCase()}`,
      icon: pane.icon,
      disabled: layout.locked || !layout.canAddInstance,
      onSelect: () => layout.addInstance(pane.id),
    })),
    { kind: 'separator' as const, id: 'sep' },
    {
      id: 'present',
      label: 'Present',
      description: 'Show only the viewer. Escape exits.',
      onSelect: () => layout.setPresenting(true),
    },
    {
      id: 'lock',
      label: 'Lock layout',
      checked: layout.locked,
      onSelect: () => layout.setLocked(!layout.locked),
    },
    {
      id: 'reset',
      label: 'Reset layout',
      description: RESET_LAYOUT_DESCRIPTION,
      disabled: layout.locked,
      onSelect: layout.resetLayout,
    },
  ];
}

export function LayoutMenu() {
  const layout = useLayout();
  if (layout.mode !== 'dock') return null;
  return (
    <Menu
      label="Panes"
      trigger={<Icon name="dock" size={18} />}
      items={() => layoutMenuEntries(layout)}
    />
  );
}
