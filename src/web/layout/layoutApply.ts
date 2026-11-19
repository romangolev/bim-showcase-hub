import { decodeShare } from './layoutShare.js';
import type { LayoutModel } from './layoutState.js';
import type { PaneAppearances } from './paneAppearance.js';
import type { PaneLifecycle, WorkspaceApplyResult } from './paneLifecycle.js';
import {
  parseWorkspace,
  type Workspace,
  type WorkspacePreset,
} from './workspaces.js';

export const LOCKED_REASON = 'Unlock the layout first';
export const DOCK_ONLY_REASON = 'Available in the wide layout';

const BLOCKED_REASON = {
  locked: LOCKED_REASON,
  'dock-only': DOCK_ONLY_REASON,
} as const;

interface LayoutApplyDeps {
  lifecycle: Pick<
    PaneLifecycle,
    'applyWorkspace' | 'revertWorkspace' | 'notify'
  >;
  appearances: {
    read: () => PaneAppearances;
    replace: (next: PaneAppearances) => unknown;
  };
}

interface LayoutApply {
  subscribe: (listener: () => void) => () => void;
  active: () => string | null;
  setActive: (id: string | null) => void;
  applyPreset: (preset: WorkspacePreset) => void;
  applySaved: (item: Workspace) => void;
  applyImported: (text: string) => string | null;
  applyShared: (param: string) => Promise<void>;
  revert: () => void;
}

export function createLayoutApply({
  lifecycle,
  appearances,
}: LayoutApplyDeps): LayoutApply {
  const { notify } = lifecycle;
  const listeners = new Set<() => void>();
  let active: string | null = null;
  let undoAppearances: PaneAppearances | null = null;

  const setActive = (id: string | null) => {
    if (active === id) return;
    active = id;
    for (const listener of [...listeners]) listener();
  };

  const applyLayout = (
    layout: LayoutModel,
    name: string,
    next: PaneAppearances,
  ): string | null => {
    const result: WorkspaceApplyResult = lifecycle.applyWorkspace(
      { layout },
      name,
    );
    if (result !== 'applied') return BLOCKED_REASON[result];
    const travels = Object.keys(next).length > 0;
    undoAppearances = travels ? appearances.read() : null;
    if (travels) appearances.replace(next);
    return null;
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    active: () => active,
    setActive,
    applyPreset: (preset) => {
      const result = lifecycle.applyWorkspace(
        {
          steps: preset.steps,
          collapsed: preset.collapsed,
          dismissed: preset.dismissed,
        },
        preset.name,
      );
      if (result !== 'applied') {
        notify(BLOCKED_REASON[result]);
        return;
      }
      undoAppearances = null;
      setActive(`preset:${preset.id}`);
    },
    applySaved: (item) => {
      const blocked = applyLayout(item.layout, item.name, item.appearances);
      if (blocked) {
        notify(blocked);
        return;
      }
      setActive(item.id);
    },
    applyImported: (text) => {
      const parsed = parseWorkspace(text);
      if ('error' in parsed) return parsed.error;
      const { name, layout, appearances: next } = parsed.workspace;
      const blocked = applyLayout(layout, name, next);
      if (blocked) return blocked;
      setActive(null);
      notify(`Layout ${name} imported`);
      return null;
    },
    applyShared: async (param) => {
      const text = await decodeShare(param);
      if (!text) {
        notify('This share link is not a readable layout.');
        return;
      }
      const parsed = parseWorkspace(text);
      if ('error' in parsed) {
        notify(parsed.error);
        return;
      }
      const { name, layout, appearances: next } = parsed.workspace;
      const blocked = applyLayout(layout, name, next);
      if (blocked) notify(blocked);
    },
    revert: () => {
      if (!lifecycle.revertWorkspace()) return;
      if (undoAppearances) appearances.replace(undoAppearances);
      undoAppearances = null;
      setActive(null);
    },
  };
}
