import type { Command, CommandHost } from '../commands/types.js';
import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { useModal } from '../modal/index.js';
import { layoutCommands, paneCommandContext } from './layoutCommandList.js';
import { type LayoutApi, useLayout } from './layoutContext.js';
import {
  definitionOf,
  isPaneId,
  isPanelClosable,
  type PaneId,
  type PanelId,
  paneById,
  paneCommandsFor,
} from './paneRegistry.js';

export const RESET_LAYOUT_DESCRIPTION =
  'Resets the arrangement. Open models stay open; remembered viewer position and closed panes are cleared.';

const NO_MODALS: CommandHost = { openModal: () => undefined };
const TOGGLE_PREFIX = 'pane.toggle.';
const CREATE_PREFIX = 'pane.new.';

function togglePaneOf(command: Command): PaneId | null {
  if (!command.id.startsWith(TOGGLE_PREFIX)) return null;
  const id = command.id.slice(TOGGLE_PREFIX.length);
  return isPaneId(id) ? id : null;
}

function commandEntry(command: Command, host: CommandHost): MenuEntry {
  return {
    id: command.id,
    label: command.title,
    ...(command.icon ? { icon: command.icon } : {}),
    ...(command.disabled
      ? { disabled: true, description: command.disabled }
      : {}),
    onSelect: () => {
      void command.run(host);
    },
  };
}

function toggleEntry(
  command: Command,
  pane: PaneId,
  layout: LayoutApi,
  host: CommandHost,
): MenuEntry {
  return {
    id: command.id,
    label: paneById(pane).title,
    ...(command.icon ? { icon: command.icon } : {}),
    checked: layout.isOpen(pane),
    ...(command.disabled
      ? { disabled: true, description: command.disabled }
      : {}),
    onSelect: () => {
      void command.run(host);
    },
  };
}

export function paneMenuEntries(
  layout: LayoutApi,
  pane: PanelId,
  host: CommandHost = NO_MODALS,
): MenuEntry[] {
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
  const commandEntries = paneCommandsFor(definition, paneCommandContext(layout))
    .filter(
      (command) =>
        !command.id.startsWith(TOGGLE_PREFIX) &&
        !command.id.startsWith(CREATE_PREFIX),
    )
    .map((command) => commandEntry(command, host));
  if (commandEntries.length > 0) {
    entries.push({ kind: 'separator', id: 'sep.commands' }, ...commandEntries);
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
  const modal = useModal();
  const title = layout.paneTitle(pane).label;
  return (
    <Menu
      label={`${title} pane options`}
      trigger={<Icon name="more" size={16} />}
      triggerClassName="dock-action"
      items={() => paneMenuEntries(layout, pane, { openModal: modal.open })}
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

export function layoutMenuEntries(
  layout: LayoutApi,
  host: CommandHost = NO_MODALS,
  commands: readonly Command[] = layoutCommands(layout),
): MenuEntry[] {
  const toggles: MenuEntry[] = [];
  const creates: MenuEntry[] = [];
  const hooks: MenuEntry[] = [];
  let present: Command | undefined;
  let lock: Command | undefined;
  let reset: Command | undefined;
  for (const command of commands) {
    const pane = togglePaneOf(command);
    if (pane) {
      toggles.push(toggleEntry(command, pane, layout, host));
    } else if (command.id.startsWith(CREATE_PREFIX)) {
      creates.push(commandEntry(command, host));
    } else if (command.id.startsWith('pane.')) {
      hooks.push(commandEntry(command, host));
    } else if (command.id === 'layout.present') {
      present = command;
    } else if (command.id === 'layout.lock') {
      lock = command;
    } else if (command.id === 'layout.reset') {
      reset = command;
    }
  }
  const entries: MenuEntry[] = [...toggles, ...creates, ...hooks];
  entries.push({ kind: 'separator', id: 'sep' });
  const presentCommand = present;
  if (presentCommand) {
    entries.push({
      id: presentCommand.id,
      label: presentCommand.title,
      ...(presentCommand.disabled
        ? { description: presentCommand.disabled, disabled: true }
        : layout.canPresent
          ? { description: 'Show only the viewer. Escape exits.' }
          : {}),
      onSelect: () => {
        void presentCommand.run(host);
      },
    });
  }
  const lockCommand = lock;
  if (lockCommand) {
    entries.push({
      id: lockCommand.id,
      label: 'Lock layout',
      checked: layout.locked,
      onSelect: () => {
        void lockCommand.run(host);
      },
    });
  }
  const resetCommand = reset;
  if (resetCommand) {
    entries.push({
      id: resetCommand.id,
      label: 'Reset layout',
      description: RESET_LAYOUT_DESCRIPTION,
      ...(resetCommand.disabled ? { disabled: true } : {}),
      onSelect: () => {
        void resetCommand.run(host);
      },
    });
  }
  return entries;
}

export function LayoutMenu() {
  const layout = useLayout();
  const modal = useModal();
  if (layout.mode !== 'dock') return null;
  return (
    <Menu
      label="Panes"
      trigger={<Icon name="dock" size={18} />}
      items={() => layoutMenuEntries(layout, { openModal: modal.open })}
    />
  );
}
