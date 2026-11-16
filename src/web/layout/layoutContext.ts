import { createContext, type ReactNode, useContext } from 'react';
import type { PaneId } from './paneRegistry.js';

export type LayoutMode = 'dock' | 'stacked';
export type MoveTarget = 'left' | 'right' | 'below' | 'float' | 'dock';

export interface DockController {
  movePane: (id: PaneId, target: MoveTarget) => void;
  openPane: (id: PaneId) => void;
  closePane: (id: PaneId) => void;
  reset: (treeWidth: number) => void;
  focusPane: (id: PaneId) => void;
  location: (id: PaneId) => 'grid' | 'floating' | null;
}

export interface LayoutApi {
  mode: LayoutMode;
  openPanes: readonly PaneId[];
  isOpen: (id: PaneId) => boolean;
  isCollapsed: (id: PaneId) => boolean;
  setCollapsed: (id: PaneId, collapsed: boolean) => void;
  togglePane: (id: PaneId) => void;
  movePane: (id: PaneId, target: MoveTarget) => void;
  resetLayout: () => void;
  focusPane: (id: PaneId) => void;
  resizeSignal: (id: PaneId) => number;
  location: (id: PaneId) => 'grid' | 'floating' | null;
  closeTreeOverlay: () => void;
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
