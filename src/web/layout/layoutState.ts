import { isRecord } from '../../shared/guards.js';
import { BSH_KEYS } from '../storage.js';
import {
  hasPlainPanel,
  isFollower,
  isInstancePanel,
  isPaneId,
  isRequired,
  PANE_IDS,
  type PaneId,
  type PanelId,
  paneById,
  paneKind,
  parsePanelId,
  TREE_WIDTH_DEFAULT,
} from './paneRegistry.js';

export const LAYOUT_KEY = BSH_KEYS.personal.layout;
export const LAYOUT_VERSION = 2;
export const TREE_WIDTH_MIN = 260;
export const TREE_WIDTH_MAX = 480;

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
  dismissed: PaneId[];
  lastViewerArrangement: SerializedDock | null;
}

export const PREVIOUS_VIEWER = 'viewer:previous';

export type LayoutAction =
  | { type: 'dock'; dock: SerializedDock }
  | { type: 'setCollapsed'; id: PaneId; collapsed: boolean }
  | { type: 'dismiss'; id: PaneId; dismissed: boolean }
  | { type: 'treeWidth'; width: number }
  | { type: 'reset' };

export function clampTreeWidth(value: number): number {
  if (!Number.isFinite(value)) return TREE_WIDTH_DEFAULT;
  return Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, Math.round(value)));
}

export function defaultModel(): LayoutModel {
  return {
    dock: null,
    collapsed: ['dashboard'],
    treeWidth: TREE_WIDTH_DEFAULT,
    dismissed: [],
    lastViewerArrangement: null,
  };
}

function toggled(list: PaneId[], id: PaneId, on: boolean): PaneId[] {
  if (list.includes(id) === on) return list;
  return on ? [...list, id] : list.filter((entry) => entry !== id);
}

export function layoutReducer(
  model: LayoutModel,
  action: LayoutAction,
): LayoutModel {
  switch (action.type) {
    case 'dock':
      return !hasViewerPanel(action.dock) &&
        model.dock &&
        hasViewerPanel(model.dock)
        ? { ...model, dock: action.dock, lastViewerArrangement: model.dock }
        : { ...model, dock: action.dock };
    case 'setCollapsed': {
      const collapsed = toggled(model.collapsed, action.id, action.collapsed);
      return collapsed === model.collapsed ? model : { ...model, collapsed };
    }
    case 'dismiss': {
      const dismissed = toggled(model.dismissed, action.id, action.dismissed);
      return dismissed === model.dismissed ? model : { ...model, dismissed };
    }
    case 'treeWidth': {
      const treeWidth = clampTreeWidth(action.width);
      return treeWidth === model.treeWidth ? model : { ...model, treeWidth };
    }
    case 'reset':
      return defaultModel();
  }
}

interface CleanScope {
  seen: Set<PanelId>;
  panels: Record<string, unknown>;
  allowed: (id: PanelId) => boolean;
}

function cleanGroup(value: unknown, scope: CleanScope): SerializedGroup | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  if (!Array.isArray(value.views)) return null;
  const views: PanelId[] = [];
  let active: PanelId | undefined;
  for (const view of value.views) {
    if (typeof view !== 'string') continue;
    if (
      scope.allowed(view) &&
      !scope.seen.has(view) &&
      isRecord(scope.panels[view])
    ) {
      scope.seen.add(view);
      views.push(view);
      if (view === value.activeView) active = view;
    }
  }
  if (views.length === 0) return null;
  return { ...value, id: value.id, views, activeView: active ?? views[0] };
}

function cleanNode(
  value: unknown,
  scope: CleanScope,
  groups: Set<string>,
): SerializedNode | null {
  if (!isRecord(value)) return null;
  if (value.type === 'leaf') {
    const group = cleanGroup(value.data, scope);
    if (!group) return null;
    groups.add(group.id);
    return { ...value, type: 'leaf', data: group };
  }
  if (value.type === 'branch' && Array.isArray(value.data)) {
    const children: SerializedNode[] = [];
    for (const child of value.data) {
      const clean = cleanNode(child, scope, groups);
      if (clean) children.push(...hoist(clean));
    }
    if (children.length === 0) return null;
    const total = sizeSum(value.data);
    return {
      ...value,
      type: 'branch',
      data: total === null ? children : scaleTo(children, total),
    };
  }
  return null;
}

function sizeOf(node: unknown): number | null {
  if (!isRecord(node)) return null;
  const size = Number(node.size);
  return Number.isFinite(size) && size > 0 ? size : null;
}

function sizeSum(nodes: readonly unknown[]): number | null {
  let total = 0;
  for (const node of nodes) {
    const size = sizeOf(node);
    if (size === null) return null;
    total += size;
  }
  return total;
}

function scaleTo(nodes: SerializedNode[], total: number): SerializedNode[] {
  const current = sizeSum(nodes);
  if (current === null || current === total) return nodes;
  return nodes.map((node) => ({
    ...node,
    size: ((node.size as number) * total) / current,
  }));
}

function hoist(node: SerializedNode): SerializedNode[] {
  if (node.type !== 'branch') return [node];
  const children = node.data as SerializedNode[];
  if (children.length !== 1) return [node];
  const only = children[0] as SerializedNode;
  if (only.type === 'leaf') {
    return [node.size === undefined ? only : { ...only, size: node.size }];
  }
  const grand = only.data as SerializedNode[];
  const size = sizeOf(node);
  return size === null ? grand : scaleTo(grand, size);
}

export function withoutPanel(
  dock: SerializedDock,
  id: PanelId,
): SerializedDock | null {
  const panels = { ...dock.panels };
  delete panels[id];
  return sanitizeDock({ ...dock, panels })?.dock ?? null;
}

export function loadWithFallback(
  dock: SerializedDock,
  load: (dock: SerializedDock) => void,
  required: (id: PanelId) => boolean = () => false,
): SerializedDock | null {
  try {
    load(dock);
    return dock;
  } catch {
    for (const id of Object.keys(dock.panels)) {
      if (required(id)) continue;
      const smaller = withoutPanel(dock, id);
      if (!smaller) continue;
      try {
        load(smaller);
        return smaller;
      } catch {}
    }
    return null;
  }
}

export function sanitizeDock(
  input: unknown,
  instances?: readonly PanelId[],
): { dock: SerializedDock; missing: PaneId[] } | null {
  if (!isRecord(input) || !isRecord(input.grid) || !isRecord(input.panels)) {
    return null;
  }
  const grid = input.grid;
  if (grid.orientation !== 'HORIZONTAL' && grid.orientation !== 'VERTICAL') {
    return null;
  }
  const wanted = instances ? new Set(instances) : null;
  const allowed = (id: PanelId) => {
    const parsed = parsePanelId(id);
    if (!parsed) return false;
    if (!parsed.instance) return hasPlainPanel(parsed.kind);
    return wanted ? wanted.has(id) : true;
  };
  const scope: CleanScope = { seen: new Set(), panels: input.panels, allowed };
  const groups = new Set<string>();
  let root = cleanNode(grid.root, scope, groups);
  let orientation: 'HORIZONTAL' | 'VERTICAL' = grid.orientation;
  const rootChildren =
    root?.type === 'branch' ? (root.data as SerializedNode[]) : [];
  const single = rootChildren.length === 1 ? rootChildren[0] : undefined;
  if (root && single?.type === 'branch') {
    root = { ...single, size: root.size };
    orientation = orientation === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL';
  }
  if (root?.type !== 'branch') return null;
  const floatingGroups: SerializedFloatingGroup[] = [];
  if (Array.isArray(input.floatingGroups)) {
    for (const floating of input.floatingGroups) {
      if (!isRecord(floating)) continue;
      const group = cleanGroup(floating.data, scope);
      if (!group) continue;
      groups.add(group.id);
      floatingGroups.push({
        ...floating,
        data: group,
        position: floating.position,
      });
    }
  }
  if (scope.seen.size === 0) return null;
  const panels: SerializedDock['panels'] = {};
  for (const id of scope.seen) {
    const panel = scope.panels[id];
    if (isRecord(panel)) panels[id] = { ...panel, id };
  }
  const { popoutGroups: _popouts, ...rest } = input;
  const dock: SerializedDock = {
    ...rest,
    grid: {
      ...grid,
      root,
      width: Number(grid.width) || 0,
      height: Number(grid.height) || 0,
      orientation,
    },
    panels,
  };
  if (Array.isArray(input.floatingGroups)) dock.floatingGroups = floatingGroups;
  if (typeof dock.activeGroup !== 'string' || !groups.has(dock.activeGroup)) {
    delete dock.activeGroup;
  }
  const kinds = new Set([...scope.seen].map(paneKind));
  const missing = PANE_IDS.filter((id) => isRequired(id) && !kinds.has(id));
  return { dock, missing };
}

export function renamePanel(
  dock: SerializedDock,
  from: PanelId,
  to: PanelId,
): SerializedDock {
  if (!(from in dock.panels) || to in dock.panels) return dock;
  const swap = (group: SerializedGroup): SerializedGroup => ({
    ...group,
    views: group.views.map((view) => (view === from ? to : view)),
    activeView: group.activeView === from ? to : group.activeView,
  });
  const visit = (node: SerializedNode): SerializedNode => {
    if (node.type === 'leaf') {
      return { ...node, data: swap(node.data as SerializedGroup) };
    }
    return { ...node, data: (node.data as SerializedNode[]).map(visit) };
  };
  const panels: SerializedDock['panels'] = {};
  for (const [key, panel] of Object.entries(dock.panels)) {
    panels[key === from ? to : key] =
      key === from ? { ...panel, id: to } : panel;
  }
  const next: SerializedDock = {
    ...dock,
    grid: { ...dock.grid, root: visit(dock.grid.root) },
    panels,
  };
  if (dock.floatingGroups) {
    next.floatingGroups = dock.floatingGroups.map((floating) => ({
      ...floating,
      data: swap(floating.data),
    }));
  }
  return next;
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
  const dismissed = Array.isArray(layout.dismissed)
    ? layout.dismissed.filter(isPaneId)
    : [];
  const source = layout.dock;
  const dock = source === null ? null : (sanitizeDock(source)?.dock ?? null);
  const remembered = sanitizeDock(
    isRecord(layout.lastViewerArrangement)
      ? layout.lastViewerArrangement
      : withPreviousViewer(source),
  )?.dock;
  return {
    dock,
    collapsed: [...new Set(collapsed)],
    treeWidth,
    dismissed: [...new Set(dismissed)],
    lastViewerArrangement:
      remembered && hasViewerPanel(remembered) ? remembered : null,
  };
}

function withPreviousViewer(dock: unknown): unknown {
  if (!isRecord(dock) || !isRecord(dock.panels) || !isRecord(dock.grid)) {
    return dock;
  }
  return 'viewer' in dock.panels
    ? renamePanel(dock as SerializedDock, 'viewer', PREVIOUS_VIEWER)
    : dock;
}

export function hasViewerPanel(dock: SerializedDock | null): boolean {
  if (!dock) return false;
  return Object.keys(dock.panels).some(
    (id) => parsePanelId(id)?.kind === 'viewer' && isInstancePanel(id),
  );
}

function mapGroups(
  dock: SerializedDock,
  map: (group: SerializedGroup) => SerializedGroup,
): SerializedDock {
  const visit = (node: SerializedNode): SerializedNode =>
    node.type === 'leaf'
      ? { ...node, data: map(node.data as SerializedGroup) }
      : { ...node, data: (node.data as SerializedNode[]).map(visit) };
  const next: SerializedDock = {
    ...dock,
    grid: { ...dock.grid, root: visit(dock.grid.root) },
  };
  if (dock.floatingGroups) {
    next.floatingGroups = dock.floatingGroups.map((floating) => ({
      ...floating,
      data: map(floating.data),
    }));
  }
  return next;
}

export function adoptArrangement(
  snapshot: SerializedDock,
  instances: readonly PanelId[],
  active: PanelId | null,
  companions: readonly PaneId[],
  titles: Readonly<Record<PanelId, { label: string }>> = {},
): SerializedDock | null {
  if (instances.length === 0) return null;
  const isViewer = (id: string) => paneKind(id) === 'viewer';
  const keep = (id: string) => {
    const kind = paneKind(id);
    if (!kind || kind === 'viewer') return false;
    return !isFollower(kind) || companions.includes(kind);
  };
  const template = Object.entries(snapshot.panels).find(([id]) =>
    isViewer(id),
  )?.[1];
  let placed = false;
  const mapped = mapGroups(snapshot, (group) => {
    const views: string[] = group.views.filter(keep);
    const hadViewer = group.views.some(isViewer);
    if (hadViewer && !placed) {
      placed = true;
      views.unshift(...instances);
      return {
        ...group,
        views,
        activeView:
          active && instances.includes(active) ? active : instances[0],
      };
    }
    return {
      ...group,
      views,
      activeView: views.includes(group.activeView as string)
        ? group.activeView
        : views[0],
    };
  });
  if (!placed) return null;
  const panels: SerializedDock['panels'] = {};
  for (const [id, panel] of Object.entries(snapshot.panels)) {
    if (keep(id)) panels[id] = panel;
  }
  for (const id of instances) {
    panels[id] = {
      ...template,
      id,
      contentComponent: 'pane',
      title: titles[id]?.label ?? paneById('viewer').title,
    };
  }
  return sanitizeDock({ ...mapped, panels }, instances)?.dock ?? null;
}

export function writeLayout(storage: Storage, model: LayoutModel) {
  try {
    storage.setItem(LAYOUT_KEY, serializeLayout(model));
  } catch {
    return;
  }
}

export function readLayout(storage: Storage): LayoutModel {
  try {
    return parseLayout(storage.getItem(LAYOUT_KEY)) ?? defaultModel();
  } catch {
    return defaultModel();
  }
}
