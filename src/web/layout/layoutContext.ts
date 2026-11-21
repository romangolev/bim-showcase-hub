import { createContext, type ReactNode, useContext } from 'react';
import type { LayoutStep } from './defaultLayout.js';
import type { SerializedDock } from './layoutState.js';
import type { PaneId, PanelId } from './paneRegistry.js';
import type { WorkspaceApi } from './workspaces.js';

export type LayoutMode = 'dock' | 'stacked';
export type MoveTarget = 'left' | 'right' | 'below' | 'float' | 'dock';

interface ApplyTarget {
  dock?: SerializedDock | null;
  steps?: readonly LayoutStep[] | null;
}

export interface DockController {
  movePane: (id: PanelId, target: MoveTarget) => void;
  openPane: (id: PaneId) => void;
  closePane: (id: PaneId) => void;
  reset: (treeWidth: number) => void;
  apply: (target: ApplyTarget, treeWidth: number) => void;
  focusPane: (id: PanelId) => void;
  toggleMaximize: (id: PanelId) => boolean;
  location: (id: PanelId) => 'grid' | 'floating' | null;
  resizePane: (
    id: PanelId,
    delta: { width?: number; height?: number },
  ) => { width: number; height: number } | null;
}

export interface LayoutApi {
  mode: LayoutMode;
  openPanes: readonly PaneId[];
  isOpen: (id: PaneId) => boolean;
  isCollapsed: (id: PaneId) => boolean;
  setCollapsed: (id: PaneId, collapsed: boolean) => void;
  togglePane: (id: PanelId) => void;
  addInstance: (kind: PaneId) => PanelId | null;
  canAddInstance: boolean;
  canPresent: boolean;
  movePane: (id: PanelId, target: MoveTarget) => void;
  resetLayout: () => void;
  locked: boolean;
  setLocked: (locked: boolean) => void;
  maximized: PanelId | null;
  toggleMaximize: (id: PanelId) => void;
  presenting: boolean;
  setPresenting: (presenting: boolean) => void;
  focusPane: (id: PanelId) => void;
  resizeSignal: (id: PanelId) => number;
  location: (id: PanelId) => 'grid' | 'floating' | null;
  startResize: (id: PanelId) => void;
  resizing: PanelId | null;
  closeTreeOverlay: () => void;
  floatNext: (urn: string) => void;
  activeModel: string | null;
  closeOthers: () => void;
  reopenClosed: () => string | null;
  canReopen: () => boolean;
  paneTitle: (id: PanelId) => PaneTitle;
  workspaces: WorkspaceApi;
  notify: (message: string) => void;
}

export const LayoutContext = createContext<LayoutApi | null>(null);

export function useLayout(): LayoutApi {
  const value = useContext(LayoutContext);
  if (!value) {
    throw new Error('useLayout must be used inside LayoutProvider');
  }
  return value;
}

export const MainContentContext = createContext<ReactNode>(null);

export function useMainContent(): ReactNode {
  return useContext(MainContentContext);
}

export interface PaneTitle {
  label: string;
  tooltip: string;
}

export type PaneTitles = Readonly<Record<PanelId, PaneTitle>>;
export type PaneTags = Readonly<Record<PanelId, string>>;
