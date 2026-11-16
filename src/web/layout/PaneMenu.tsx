import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { type LayoutApi, useLayout } from './layoutContext.js';
import { PANES, type PaneId, paneById } from './paneRegistry.js';

export function paneMenuEntries(layout: LayoutApi, pane: PaneId): MenuEntry[] {
  const definition = paneById(pane);
  const floating = layout.location(pane) === 'floating';
  const collapsed = layout.isCollapsed(pane);
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
      id: 'collapse',
      label: collapsed ? 'Expand' : 'Collapse',
      onSelect: () => layout.setCollapsed(pane, !collapsed),
    });
  }
  if (definition.closable) {
    entries.push({
      id: 'close',
      label: 'Close',
      onSelect: () => layout.togglePane(pane),
    });
  }
  entries.push(
    { kind: 'separator', id: 'sep' },
    { id: 'reset', label: 'Reset layout', onSelect: layout.resetLayout },
  );
  return entries;
}

export function PaneMenu({ pane }: { pane: PaneId }) {
  const layout = useLayout();
  const title = paneById(pane).title;
  return (
    <Menu
      label={`${title} pane options`}
      trigger={<Icon name="more" size={16} />}
      triggerClassName="dock-action"
      items={() => paneMenuEntries(layout, pane)}
    />
  );
}

export function CollapseAction({ pane }: { pane: PaneId }) {
  const layout = useLayout();
  if (layout.location(pane) === 'floating') return null;
  const collapsed = layout.isCollapsed(pane);
  const label = `${collapsed ? 'Expand' : 'Collapse'} ${paneById(pane).title}`;
  return (
    <button
      type="button"
      className="dock-action"
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      onClick={() => layout.setCollapsed(pane, !collapsed)}
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

export function PaneActions({ pane }: { pane: PaneId }) {
  return (
    <>
      <CollapseAction pane={pane} />
      <PaneMenu pane={pane} />
    </>
  );
}

export function layoutMenuEntries(layout: LayoutApi): MenuEntry[] {
  return [
    ...PANES.filter((pane) => pane.closable).map((pane) => ({
      id: pane.id,
      label: pane.title,
      icon: pane.icon,
      checked: layout.isOpen(pane.id),
      onSelect: () => layout.togglePane(pane.id),
    })),
    { kind: 'separator' as const, id: 'sep' },
    { id: 'reset', label: 'Reset layout', onSelect: layout.resetLayout },
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
