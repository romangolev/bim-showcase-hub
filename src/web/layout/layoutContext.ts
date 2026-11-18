import { createContext, type ReactNode, useContext } from 'react';
import type { PaneId, PanelId } from './paneRegistry.js';

export type LayoutMode = 'dock' | 'stacked';
export type MoveTarget = 'left' | 'right' | 'below' | 'float' | 'dock';

export interface DockController {
  movePane: (id: PanelId, target: MoveTarget) => void;
  openPane: (id: PaneId) => void;
  closePane: (id: PaneId) => void;
  reset: (treeWidth: number) => void;
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
  paneTitle: (id: PanelId) => PaneTitle;
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
