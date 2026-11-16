import type {
  BubbleNode,
  DocumentNodeLoadOptions,
  ViewerEvent,
  ViewerModel,
  ViewingDocument,
} from './autodesk.js';

export interface FederationAnchor {
  globalOffset?: unknown;
  unit?: string;
  is2d: boolean;
}

export const NO_MATCHING_VIEW_MESSAGE = {
  '2d': 'This file has no 2D view to combine with the open sheets.',
  '3d': 'This file has no 3D view to combine with the open models.',
} as const;

export const NO_GEOMETRY_MESSAGE =
  'No viewable geometry: this file was translated but has no 3D or 2D view.';

export const OTHER_REGION_MESSAGE =
  'This model is stored in another region. Open it in its own viewer.';

export function nodeIs2d(node: unknown): boolean | undefined {
  const bubble = node as BubbleNode | null | undefined;
  if (!bubble) return undefined;
  if (typeof bubble.is2D === 'function') return bubble.is2D();
  if (typeof bubble.is3D === 'function') return !bubble.is3D();
  return undefined;
}

export function pickGeometryNode(
  doc: ViewingDocument,
  anchor: FederationAnchor | null,
): unknown {
  const root = doc.getRoot();
  const preferred = root.getDefaultGeometry();
  if (!preferred) {
    const any = root.search?.({ type: 'geometry' })[0];
    if (!any) throw new Error(NO_GEOMETRY_MESSAGE);
    return anchor ? pickFrom(any, root, anchor) : any;
  }
  if (!anchor) return preferred;
  return pickFrom(preferred, root, anchor);
}

function pickFrom(
  preferred: unknown,
  root: ReturnType<ViewingDocument['getRoot']>,
  anchor: FederationAnchor,
): unknown {
  const dimension = nodeIs2d(preferred);
  if (dimension === undefined || dimension === anchor.is2d) return preferred;
  const role = anchor.is2d ? '2d' : '3d';
  const match = root.search?.({ type: 'geometry', role })[0];
  if (match) return match;
  throw new Error(NO_MATCHING_VIEW_MESSAGE[role]);
}

export function anchorOf(model: ViewerModel): FederationAnchor {
  const is2d = model.is2d?.() ?? false;
  const unit = is2d ? undefined : model.getUnitString?.() || undefined;
  return {
    globalOffset: model.getData?.()?.globalOffset,
    unit,
    is2d,
  };
}

export function federatedLoadOptions(
  anchor: FederationAnchor | null,
): DocumentNodeLoadOptions {
  const options: DocumentNodeLoadOptions = {
    keepCurrentModels: true,
    applyRefPoint: true,
  };
  if (!anchor) return options;
  if (anchor.globalOffset) options.globalOffset = anchor.globalOffset;
  if (anchor.unit) options.applyScaling = anchor.unit;
  return options;
}

export function selectionIds(ev: ViewerEvent): number[] {
  if (ev.selections) {
    return ev.selections.flatMap((entry) => entry.dbIdArray ?? []);
  }
  return [...(ev.dbIdArray ?? [])];
}
