import type { Command } from '../commands/types.js';
import { notify } from '../tasks/notifications.js';
import { DOCK_ONLY_REASON, LOCKED_REASON } from './layoutApply.js';
import type { LayoutApi } from './layoutContext.js';
import { type PaneCommandContext, paneCommands } from './paneRegistry.js';

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
      id: 'layout.undo',
      title: 'Undo layout change',
      group: 'Layout',
      keywords: 'back revert move close collapse',
      keys: ['mod+z'],
      scope: 'dock',
      ...reason(
        layout.locked
          ? LOCKED_REASON
          : !docked
            ? DOCK_ONLY_REASON
            : layout.canUndo
              ? undefined
              : 'Nothing to undo',
      ),
      run: () => {
        if (!layout.undoLayout()) return;
        notify('Layout restored', {
          action: { label: 'Redo', run: () => void layout.redoLayout() },
        });
      },
    },
    {
      id: 'layout.redo',
      title: 'Redo layout change',
      group: 'Layout',
      keys: ['mod+shift+z', 'mod+y'],
      scope: 'dock',
      ...reason(
        layout.locked
          ? LOCKED_REASON
          : !docked
            ? DOCK_ONLY_REASON
            : layout.canRedo
              ? undefined
              : 'Nothing to redo',
      ),
      run: () => void layout.redoLayout(),
    },
    {
      id: 'layout.workspace.save',
      title: 'Save workspace as…',
      group: 'Workspaces',
      keywords: 'preset arrangement named',
      menu: 'hook',
      ...reason(docked ? undefined : DOCK_ONLY_REASON),
      run: () => layout.workspaces.openDialog({ kind: 'save' }),
    },
    {
      id: 'layout.workspace.import',
      title: 'Import layout…',
      group: 'Workspaces',
      keywords: 'paste drop file json',
      menu: 'hook',
      ...reason(
        layout.locked ? LOCKED_REASON : docked ? undefined : DOCK_ONLY_REASON,
      ),
      run: () => layout.workspaces.openDialog({ kind: 'import' }),
    },
    {
      id: 'layout.workspace.download',
      title: 'Download layout',
      group: 'Workspaces',
      keywords: 'export file json workspace',
      menu: 'hook',
      run: () => layout.workspaces.download(),
    },
    {
      id: 'layout.workspace.copy',
      title: 'Copy layout JSON',
      group: 'Workspaces',
      keywords: 'export clipboard workspace',
      menu: 'hook',
      run: () => layout.workspaces.copyJson(),
    },
    {
      id: 'layout.workspace.link',
      title: 'Copy layout link',
      group: 'Workspaces',
      keywords: 'share url compressed',
      menu: 'hook',
      ...reason(docked ? undefined : DOCK_ONLY_REASON),
      run: () => layout.workspaces.copyLink(),
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
          : !docked
            ? DOCK_ONLY_REASON
            : layout.workspaces.canRevert
              ? undefined
              : 'Nothing to revert',
      ),
      run: () => layout.workspaces.revert(),
    },
  ];
}
