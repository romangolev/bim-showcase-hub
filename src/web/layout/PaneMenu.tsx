import { useMemo, useState } from 'react';
import type { Command, CommandHost } from '../commands/types.js';
import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { useModal } from '../modal/index.js';
import { ModalHost } from '../modal/ModalHost.js';
import {
  type PaneSettingsSchema,
  paneSettingsSchema,
} from '../settings/paneSettingsSchema.js';
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

export interface PaneMenuHost extends CommandHost {
  openPaneSettings: (schema: PaneSettingsSchema) => void;
}

const NO_MODALS: PaneMenuHost = {
  openModal: () => undefined,
  openPaneSettings: () => undefined,
};
function togglePaneOf(command: Command): PaneId | null {
  return command.menu === 'toggle' && isPaneId(command.pane)
    ? command.pane
    : null;
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

function settingsEntry(
  schema: PaneSettingsSchema,
  host: PaneMenuHost,
): MenuEntry {
  return {
    id: 'settings',
    label: 'Settings',
    description: schema.description,
    onSelect: () => {
      schema.onOpen?.();
      if (schema.modalId) {
        host.openModal(schema.modalId);
        return;
      }
      if (schema.Body) host.openPaneSettings(schema);
    },
  };
}

export function paneMenuEntries(
  layout: LayoutApi,
  pane: PanelId,
  host: PaneMenuHost = NO_MODALS,
): MenuEntry[] {
  const definition = definitionOf(pane);
  const kind = definition.id;
  const schema = paneSettingsSchema(kind);
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
    ...(schema ? [settingsEntry(schema, host)] : []),
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
    .filter((command) => command.menu !== 'toggle' && command.menu !== 'create')
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
  const [inline, setInline] = useState<PaneSettingsSchema | null>(null);
  const inlineBody = useMemo(() => {
    const Body = inline?.Body;
    return Body ? () => <Body /> : null;
  }, [inline]);
  const title = layout.paneTitle(pane).label;
  return (
    <>
      <Menu
        label={`${title} pane options`}
        trigger={<Icon name="more" size={16} />}
        triggerClassName="dock-action"
        items={() =>
          paneMenuEntries(layout, pane, {
            openModal: modal.open,
            openPaneSettings: setInline,
          })
        }
      />
      {inline && inlineBody ? (
        <ModalHost
          definition={{
            id: 'pane-settings',
            title: inline.windowTitle,
            size: 'md',
            Body: inlineBody,
          }}
          onClose={() => setInline(null)}
        />
      ) : null}
    </>
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
    } else if (command.menu === 'create') {
      creates.push(commandEntry(command, host));
    } else if (command.menu === 'present') {
      present = command;
    } else if (command.menu === 'lock') {
      lock = command;
    } else if (command.menu === 'reset') {
      reset = command;
    } else {
      hooks.push(commandEntry(command, host));
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
      label: lockCommand.title,
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
      description: resetCommand.disabled ?? RESET_LAYOUT_DESCRIPTION,
      ...(resetCommand.disabled ? { disabled: true } : {}),
      onSelect: () => {
        void resetCommand.run(host);
      },
    });
  }
  return entries;
}
