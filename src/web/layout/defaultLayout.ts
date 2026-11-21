import {
  isUserFamily,
  PANES,
  type PaneId,
  type Placement,
} from './paneRegistry.js';

export interface LayoutStep {
  id: PaneId;
  placement: Placement;
}

const RANK: Record<Placement['kind'], number> = {
  root: 0,
  beside: 1,
  edge: 2,
  tab: 3,
};

export const DEFAULT_DISMISSED: readonly PaneId[] = [
  'measurements',
  'views',
  'versions',
];

export function defaultSteps(treeWidth: number): LayoutStep[] {
  const steps = PANES.filter(
    (pane) => !isUserFamily(pane.id) && !DEFAULT_DISMISSED.includes(pane.id),
  ).map((pane) => ({
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
