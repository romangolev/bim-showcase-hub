import type { Command } from '../commands/types.js';
import type { LayoutApi } from './layoutContext.js';
import { type PaneCommandContext, paneCommands } from './paneRegistry.js';

export const LOCKED_REASON = 'Unlock the layout first';
export const DOCK_ONLY_REASON = 'Available in the wide layout';

export function paneCommandContext(layout: LayoutApi): PaneCommandContext {
  const editable = layout.locked
    ? LOCKED_REASON
    : layout.mode === 'dock'
      ? undefined
      : DOCK_ONLY_REASON;
  const createReason = layout.locked
    ? LOCKED_REASON
    : layout.canAddInstance
      ? undefined
      : 'Open a model first';
  return {
    isOpen: layout.isOpen,
    toggle: layout.togglePane,
    create: layout.addInstance,
    focus: layout.focusPane,
    ...(editable ? { toggleDisabled: editable } : {}),
    ...(createReason ? { createDisabled: createReason } : {}),
  };
}

export function layoutCommands(layout: LayoutApi): Command[] {
  const docked = layout.mode === 'dock';
  const reason = (disabled: string | undefined) =>
    disabled ? { disabled } : {};
  return [
    ...paneCommands(paneCommandContext(layout)),
    {
      id: 'layout.present',
      title: layout.presenting ? 'Exit present mode' : 'Present',
      group: 'Layout',
      keywords: 'presentation fullscreen',
      keys: ['mod+alt+p'],
      menu: 'present',
      ...reason(
        layout.presenting
          ? undefined
          : !docked
            ? DOCK_ONLY_REASON
            : layout.canPresent
              ? undefined
              : 'Open a model first',
      ),
      run: () => layout.setPresenting(!layout.presenting),
    },
    {
      id: 'layout.lock',
      title: layout.locked ? 'Unlock layout' : 'Lock layout',
      group: 'Layout',
      keys: ['mod+alt+l'],
      menu: 'lock',
      run: () => layout.setLocked(!layout.locked),
    },
    {
      id: 'layout.reset',
      title: 'Reset layout',
      group: 'Layout',
      menu: 'reset',
      ...reason(layout.locked ? LOCKED_REASON : undefined),
      run: () => layout.resetLayout(),
    },
    {
      id: 'layout.workspace.save',
      title: 'Save workspace as…',
      group: 'Workspaces',
      keywords: 'preset arrangement named',
      menu: 'hook',
      run: () => layout.workspaces.openDialog({ kind: 'save' }),
    },
    {
      id: 'layout.workspace.revert',
      title: 'Revert layout',
      group: 'Workspaces',
      keywords: 'undo workspace previous',
      menu: 'hook',
      ...reason(
        layout.locked
          ? LOCKED_REASON
          : layout.workspaces.canRevert
            ? undefined
            : 'Nothing to revert',
      ),
      run: () => layout.workspaces.revert(),
    },
  ];
}
