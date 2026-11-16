import type { ComponentType } from 'react';
import type { IconName } from '../components/icons.js';
import {
  DashboardPane,
  SummaryPane,
  TreePane,
  ViewerPaneBody,
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

export interface PaneDefinition {
  id: PaneId;
  title: string;
  icon: IconName;
  component: ComponentType;
  minSize: { width: number; height: number };
  defaultPlacement: Placement;
  closable: boolean;
  canFloat: boolean;
  requires: 'viewer' | 'none';
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
    closable: true,
    canFloat: true,
    requires: 'none',
  },
  {
    id: 'viewer',
    title: 'Viewer',
    icon: 'model',
    component: ViewerPaneBody,
    minSize: { width: 360, height: 280 },
    defaultPlacement: { kind: 'root' },
    closable: false,
    canFloat: true,
    requires: 'none',
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
      size: 320,
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
