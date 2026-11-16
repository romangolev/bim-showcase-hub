import type { LayoutMode } from './layoutContext.js';
import { type PaneId, type PanelId, parsePanelId } from './paneRegistry.js';
import { stackedPanes } from './StackedLayout.js';

export interface MountInput {
  mode: LayoutMode;
  open: readonly PaneId[];
  companions: readonly PaneId[];
  onModel: boolean;
  instances: readonly PanelId[];
}

export function mountedPanels(
  attached: readonly PanelId[],
  input: MountInput,
): PanelId[] {
  const wanted = new Set(input.instances);
  const stack =
    input.mode === 'stacked'
      ? new Set(stackedPanes(input.companions, input.onModel))
      : null;
  return attached.filter((id) => {
    const parsed = parsePanelId(id);
    if (!parsed) return false;
    if (parsed.instance) return wanted.has(id);
    if (parsed.kind === 'tree') return true;
    return stack ? stack.has(parsed.kind) : input.open.includes(parsed.kind);
  });
}
