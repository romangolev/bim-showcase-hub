import type { ComponentType } from 'react';
import type { IconName } from '../components/icons.js';
import { PANEL_SEPARATOR, type PanelId } from './panelIds.js';
import {
  DashboardPane,
  ModelPaneBody,
  SummaryPane,
  TreePane,
} from './panes.js';

export type PaneId = 'tree' | 'viewer' | 'summary' | 'dashboard';

export type PlacementDirection = 'left' | 'right' | 'below';

export type Placement =
  | { kind: 'root' }
  | { kind: 'edge'; direction: PlacementDirection; size: number }
  | {
      kind: 'beside';
      reference: PaneId;
      direction: PlacementDirection;
      size: number;
    };

export interface PaneInstances {
  component: ComponentType<{ instance: string }>;
  closable: boolean;
}

export interface PaneDefinition {
  id: PaneId;
  title: string;
  icon: IconName;
  component: ComponentType | null;
  minSize: { width: number; height: number };
  defaultPlacement: Placement;
  closable: boolean;
  canFloat: boolean;
  requires: 'viewer' | 'none';
  instances?: PaneInstances;
}

export const TREE_WIDTH_DEFAULT = 320;

export const PANES: readonly PaneDefinition[] = [
  {
    id: 'tree',
    title: 'Documents',
    icon: 'folder',
    component: TreePane,
    minSize: { width: 260, height: 160 },
    defaultPlacement: {
      kind: 'edge',
      direction: 'left',
      size: TREE_WIDTH_DEFAULT,
    },
    closable: false,
    canFloat: true,
    requires: 'none',
  },
  {
    id: 'viewer',
    title: 'Viewer',
    icon: 'model',
    component: null,
    minSize: { width: 360, height: 280 },
    defaultPlacement: { kind: 'root' },
    closable: true,
    canFloat: true,
    requires: 'none',
    instances: { component: ModelPaneBody, closable: true },
  },
  {
    id: 'summary',
    title: 'Model summary',
    icon: 'table',
    component: SummaryPane,
    minSize: { width: 280, height: 160 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'right',
      size: 340,
    },
    closable: true,
    canFloat: true,
    requires: 'viewer',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: 'chart',
    component: DashboardPane,
    minSize: { width: 320, height: 120 },
    defaultPlacement: {
      kind: 'beside',
      reference: 'viewer',
      direction: 'below',
      size: 220,
    },
    closable: true,
    canFloat: true,
    requires: 'viewer',
  },
];

const BY_ID = new Map(PANES.map((pane) => [pane.id, pane]));

export function isPaneId(value: unknown): value is PaneId {
  return typeof value === 'string' && BY_ID.has(value as PaneId);
}

export function paneById(id: PaneId): PaneDefinition {
  const pane = BY_ID.get(id);
  if (!pane) {
    throw new Error(`Unknown pane ${id}`);
  }
  return pane;
}

export function isRequired(id: PaneId): boolean {
  return !paneById(id).closable;
}

export const PANE_IDS: readonly PaneId[] = PANES.map((pane) => pane.id);

export { instancePanelId, type PanelId } from './panelIds.js';

export interface ParsedPanel {
  kind: PaneId;
  instance: string | null;
}

export function parsePanelId(id: unknown): ParsedPanel | null {
  if (typeof id !== 'string') return null;
  if (isPaneId(id)) return { kind: id, instance: null };
  const at = id.indexOf(PANEL_SEPARATOR);
  if (at <= 0) return null;
  const kind = id.slice(0, at);
  const instance = id.slice(at + 1);
  if (!isPaneId(kind) || !instance || !paneById(kind).instances) return null;
  return { kind, instance };
}

export function paneKind(id: unknown): PaneId | null {
  return parsePanelId(id)?.kind ?? null;
}

export function isPanelId(id: unknown): id is PanelId {
  return parsePanelId(id) !== null;
}

export function isInstancePanel(id: unknown): boolean {
  return Boolean(parsePanelId(id)?.instance);
}

export function definitionOf(id: PanelId): PaneDefinition {
  const kind = paneKind(id);
  if (!kind) throw new Error(`Unknown panel ${id}`);
  return paneById(kind);
}

export function followersOf(kind: PaneId): PaneId[] {
  return PANES.filter((pane) => pane.requires === kind).map((pane) => pane.id);
}

export function isFollower(id: PaneId): boolean {
  return paneById(id).requires !== 'none';
}

export const FOLLOWERS: readonly PaneId[] = PANE_IDS.filter(isFollower);

export function hasPlainPanel(id: PaneId): boolean {
  return paneById(id).component !== null;
}

export function isPanelClosable(id: PanelId): boolean {
  const parsed = parsePanelId(id);
  if (!parsed) return false;
  const definition = paneById(parsed.kind);
  return parsed.instance
    ? Boolean(definition.instances?.closable)
    : definition.closable;
}
