import {
  isPaneId,
  isRequired,
  PANE_IDS,
  type PaneId,
  TREE_WIDTH_DEFAULT,
} from './paneRegistry.js';

export const LAYOUT_KEY = 'bsh.layout.v1';
export const LAYOUT_VERSION = 1;
export const LEGACY_KEYS = {
  treeWidth: 'bsh.tree.width',
  summary: 'bsh.summary.collapsed',
  dashboard: 'bsh.dashboard.collapsed',
} as const;
export const TREE_WIDTH_MIN = 260;
export const TREE_WIDTH_MAX = 480;
export const DASHBOARD_AUTO_COLLAPSE_HEIGHT = 900;

export interface SerializedNode {
  type: 'leaf' | 'branch';
  data: unknown;
  size?: number;
  visible?: boolean;
}

export interface SerializedGroup {
  id: string;
  views: string[];
  activeView?: string;
  [key: string]: unknown;
}

export interface SerializedFloatingGroup {
  data: SerializedGroup;
  position: unknown;
}

export interface SerializedDock {
  grid: {
    root: SerializedNode;
    width: number;
    height: number;
    orientation: 'HORIZONTAL' | 'VERTICAL';
    [key: string]: unknown;
  };
  panels: Record<string, { id: string; [key: string]: unknown }>;
  activeGroup?: string;
  floatingGroups?: SerializedFloatingGroup[];
  popoutGroups?: unknown[];
  [key: string]: unknown;
}

export interface LayoutModel {
  dock: SerializedDock | null;
  collapsed: PaneId[];
  treeWidth: number;
}

export type LayoutAction =
  | { type: 'dock'; dock: SerializedDock }
  | { type: 'setCollapsed'; id: PaneId; collapsed: boolean }
  | { type: 'reset'; height: number };

export function clampTreeWidth(value: number): number {
  if (!Number.isFinite(value)) return TREE_WIDTH_DEFAULT;
  return Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(value)));
}

export function defaultModel(height: number): LayoutModel {
  return {
    dock: null,
    collapsed: height < DASHBOARD_AUTO_COLLAPSE_HEIGHT ? ['dashboard'] : [],
    treeWidth: TREE_WIDTH_DEFAULT,
  };
}

export function layoutReducer(
  model: LayoutModel,
  action: LayoutAction,
): LayoutModel {
  switch (action.type) {
    case 'dock':
      return { ...model, dock: action.dock };
    case 'setCollapsed': {
      const without = model.collapsed.filter((id) => id !== action.id);
      const collapsed = action.collapsed ? [...without, action.id] : without;
      return { ...model, collapsed };
    }
    case 'reset':
      return defaultModel(action.height);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanGroup(
  value: unknown,
  seen: Set<PaneId>,
  panels: Record<string, unknown>,
): SerializedGroup | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (!Array.isArray(value.views)) return null;
  const views: PaneId[] = [];
  for (const view of value.views) {
    if (isPaneId(view) && !seen.has(view) && isRecord(panels[view])) {
      seen.add(view);
      views.push(view);
    }
  }
  if (views.length === 0) return null;
  const group: SerializedGroup = { ...value, id: value.id, views };
  if (!views.includes(group.activeView as PaneId)) {
    group.activeView = views[0];
  }
  return group;
}

function cleanNode(
  value: unknown,
  seen: Set<PaneId>,
  panels: Record<string, unknown>,
  groups: Set<string>,
): SerializedNode | null {
  if (!isRecord(value)) return null;
  if (value.type === 'leaf') {
    const group = cleanGroup(value.data, seen, panels);
    if (!group) return null;
    groups.add(group.id);
    return { ...value, type: 'leaf', data: group };
  }
  if (value.type === 'branch' && Array.isArray(value.data)) {
    const children = value.data
      .map((child) => cleanNode(child, seen, panels, groups))
      .filter((child): child is SerializedNode => child !== null);
    if (children.length === 0) return null;
    return { ...value, type: 'branch', data: children };
  }
  return null;
}

export function sanitizeDock(
  input: unknown,
): { dock: SerializedDock; missing: PaneId[] } | null {
  if (!isRecord(input) || !isRecord(input.grid) || !isRecord(input.panels)) {
    return null;
  }
  const grid = input.grid;
  if (grid.orientation !== 'HORIZONTAL' && grid.orientation !== 'VERTICAL') {
    return null;
  }
  const seen = new Set<PaneId>();
  const groups = new Set<string>();
  const sourcePanels = input.panels;
  const root = cleanNode(grid.root, seen, sourcePanels, groups);
  if (root?.type !== 'branch') return null;
  const floatingGroups: SerializedFloatingGroup[] = [];
  if (Array.isArray(input.floatingGroups)) {
    for (const floating of input.floatingGroups) {
      if (!isRecord(floating)) continue;
      const group = cleanGroup(floating.data, seen, sourcePanels);
      if (!group) continue;
      groups.add(group.id);
      floatingGroups.push({
        ...floating,
        data: group,
        position: floating.position,
      });
    }
  }
  if (seen.size === 0) return null;
  const panels: SerializedDock['panels'] = {};
  for (const id of PANE_IDS) {
    const panel = sourcePanels[id];
    if (seen.has(id) && isRecord(panel)) panels[id] = { ...panel, id };
  }
  const { popoutGroups: _popouts, ...rest } = input;
  const dock: SerializedDock = {
    ...rest,
    grid: {
      ...grid,
      root,
      width: Number(grid.width) || 0,
      height: Number(grid.height) || 0,
      orientation: grid.orientation,
    },
    panels,
  };
  if (Array.isArray(input.floatingGroups)) dock.floatingGroups = floatingGroups;
  if (typeof dock.activeGroup !== 'string' || !groups.has(dock.activeGroup)) {
    delete dock.activeGroup;
  }
  const missing = PANE_IDS.filter((id) => isRequired(id) && !seen.has(id));
  return { dock, missing };
}

export function splitAxisOf(
  dock: SerializedDock,
  groupId: string,
): 'width' | 'height' | null {
  const rootAxis = dock.grid.orientation === 'HORIZONTAL' ? 'width' : 'height';
  const visit = (
    node: SerializedNode,
    axis: 'width' | 'height',
  ): 'width' | 'height' | null => {
    if (node.type === 'leaf') {
      return isRecord(node.data) && node.data.id === groupId ? axis : null;
    }
    if (!Array.isArray(node.data)) return null;
    const next = axis === 'width' ? 'height' : 'width';
    for (const child of node.data as SerializedNode[]) {
      const found = visit(child, next);
      if (found) return found;
    }
    return null;
  };
  if (!Array.isArray(dock.grid.root.data)) return null;
  for (const child of dock.grid.root.data as SerializedNode[]) {
    const found = visit(child, rootAxis);
    if (found) return found;
  }
  return null;
}

export function siblingCountOf(
  dock: SerializedDock,
  groupId: string,
): number | null {
  const visit = (node: SerializedNode): number | null => {
    if (node.type !== 'branch' || !Array.isArray(node.data)) return null;
    const children = node.data as SerializedNode[];
    for (const child of children) {
      if (
        child.type === 'leaf' &&
        isRecord(child.data) &&
        child.data.id === groupId
      ) {
        return children.length;
      }
      const found = visit(child);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(dock.grid.root);
}

export function serializeLayout(model: LayoutModel): string {
  return JSON.stringify({ version: LAYOUT_VERSION, layout: model });
}

export function parseLayout(raw: string | null): LayoutModel | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== LAYOUT_VERSION) return null;
  const layout = parsed.layout;
  if (!isRecord(layout)) return null;
  const collapsed = Array.isArray(layout.collapsed)
    ? layout.collapsed.filter(isPaneId)
    : [];
  const treeWidth = clampTreeWidth(Number(layout.treeWidth));
  const dock =
    layout.dock === null ? null : (sanitizeDock(layout.dock)?.dock ?? null);
  return { dock, collapsed: [...new Set(collapsed)], treeWidth };
}

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    return;
  }
}

export function importLegacy(storage: Storage, height: number): LayoutModel {
  const model = defaultModel(height);
  const width = safeGet(storage, LEGACY_KEYS.treeWidth);
  const summary = safeGet(storage, LEGACY_KEYS.summary);
  const dashboard = safeGet(storage, LEGACY_KEYS.dashboard);
  const collapsed: PaneId[] = [];
  if (summary === '1') collapsed.push('summary');
  if (
    dashboard === '1' ||
    (dashboard === null && height < DASHBOARD_AUTO_COLLAPSE_HEIGHT)
  ) {
    collapsed.push('dashboard');
  }
  for (const key of Object.values(LEGACY_KEYS)) safeRemove(storage, key);
  return {
    ...model,
    collapsed,
    treeWidth: width === null ? model.treeWidth : clampTreeWidth(Number(width)),
  };
}

export function writeLayout(storage: Storage, model: LayoutModel) {
  try {
    storage.setItem(LAYOUT_KEY, serializeLayout(model));
  } catch {
    return;
  }
}

export function readLayout(storage: Storage, height: number): LayoutModel {
  let raw: string | null;
  try {
    raw = storage.getItem(LAYOUT_KEY);
  } catch {
    return defaultModel(height);
  }
  if (raw === null) {
    const imported = importLegacy(storage, height);
    writeLayout(storage, imported);
    return imported;
  }
  return parseLayout(raw) ?? defaultModel(height);
}
