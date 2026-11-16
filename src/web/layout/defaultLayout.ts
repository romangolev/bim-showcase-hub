import { PANES, type PaneId, type Placement } from './paneRegistry.js';

export interface LayoutStep {
  id: PaneId;
  placement: Placement;
}

const RANK: Record<Placement['kind'], number> = {
  root: 0,
  beside: 1,
  edge: 2,
};

export function defaultSteps(treeWidth: number): LayoutStep[] {
  const steps = PANES.map((pane) => ({
    id: pane.id,
    placement:
      pane.id === 'tree' && pane.defaultPlacement.kind === 'edge'
        ? { ...pane.defaultPlacement, size: treeWidth }
        : pane.defaultPlacement,
  }));
  return steps
    .map((step, index) => ({ step, index }))
    .sort(
      (a, b) =>
        RANK[a.step.placement.kind] - RANK[b.step.placement.kind] ||
        a.index - b.index,
    )
    .map(({ step }) => step);
}

export function placementFor(
  placement: Placement,
  isOpen: (id: PaneId) => boolean,
): Placement {
  if (placement.kind === 'beside' && !isOpen(placement.reference)) {
    return {
      kind: 'edge',
      direction: placement.direction,
      size: placement.size,
    };
  }
  return placement;
}
