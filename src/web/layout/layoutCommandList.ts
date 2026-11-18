import type { Command } from '../commands/types.js';
import type { LayoutApi } from './layoutContext.js';
import { PANES } from './paneRegistry.js';

export const LOCKED_REASON = 'Unlock the layout first';
export const DOCK_ONLY_REASON = 'Available in the wide layout';

export function layoutCommands(layout: LayoutApi): Command[] {
  const docked = layout.mode === 'dock';
  const editable = layout.locked
    ? LOCKED_REASON
    : docked
      ? undefined
      : DOCK_ONLY_REASON;
  const reason = (disabled: string | undefined) =>
    disabled ? { disabled } : {};
  const panes = PANES.filter((pane) => pane.closable && !pane.instances).map(
    (pane): Command => ({
      id: `pane.toggle.${pane.id}`,
      title: `${layout.isOpen(pane.id) ? 'Close' : 'Open'} ${pane.title} pane`,
      group: 'Panes',
      icon: pane.icon,
      keywords: 'show hide toggle',
      ...reason(editable),
      run: () => layout.togglePane(pane.id),
    }),
  );
  const created = PANES.filter((pane) => pane.instances?.creatable).map(
    (pane): Command => ({
      id: `pane.new.${pane.id}`,
      title: `New ${pane.title.toLowerCase()}`,
      group: 'Panes',
      icon: pane.icon,
      ...reason(
        layout.locked
          ? LOCKED_REASON
          : layout.canAddInstance
            ? undefined
            : 'Open a model first',
      ),
      run: () => {
        layout.addInstance(pane.id);
      },
    }),
  );
  return [
    ...panes,
    ...created,
    {
      id: 'pane.focus.tree',
      title: 'Go to Documents',
      group: 'Panes',
      icon: 'folder',
      run: () => layout.focusPane('tree'),
    },
    {
      id: 'layout.present',
      title: layout.presenting ? 'Exit present mode' : 'Present',
      group: 'Layout',
      keywords: 'presentation fullscreen',
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
      run: () => layout.setLocked(!layout.locked),
    },
    {
      id: 'layout.reset',
      title: 'Reset layout',
      group: 'Layout',
      ...reason(layout.locked ? LOCKED_REASON : undefined),
      run: () => layout.resetLayout(),
    },
  ];
}
