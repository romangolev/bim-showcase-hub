import type {
  BubbleNode,
  DocumentNodeLoadOptions,
  ViewerModel,
  ViewingDocument,
} from './autodesk.js';
import { type FailureReason, ModelLoadError } from './modelSet.js';

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

export const STILL_PROCESSING_MESSAGE =
  'This file is still being translated for the viewer.';

export const OTHER_REGION_MESSAGE =
  'This model is stored in another region. Open it in its own viewer.';

export function nodeIs2d(node: unknown): boolean | undefined {
  const bubble = node as BubbleNode | null | undefined;
  if (!bubble) return undefined;
  if (typeof bubble.is2D === 'function') return bubble.is2D();
  if (typeof bubble.is3D === 'function') return !bubble.is3D();
  return undefined;
}

function noGeometry(status: string | undefined): ModelLoadError {
  return /^(pending|inprogress|processing)$/i.test(status ?? '')
    ? new ModelLoadError('processing', STILL_PROCESSING_MESSAGE)
    : new ModelLoadError('no-viewable', NO_GEOMETRY_MESSAGE);
}

const DOCUMENT_ERROR_REASONS: Record<number, FailureReason> = {
  4: 'access',
  5: 'missing',
  9: 'no-viewable',
};

export function documentLoadError(
  code: number,
  message: string,
): ModelLoadError {
  return new ModelLoadError(
    DOCUMENT_ERROR_REASONS[code] ?? 'unknown',
    `Document load failed (${code}): ${message}`,
  );
}

export function nodeGuid(node: unknown): string | undefined {
  const bubble = node as BubbleNode | null | undefined;
  if (!bubble) return undefined;
  const read = bubble.guid?.();
  if (typeof read === 'string' && read) return read;
  const data = bubble.data?.guid;
  return typeof data === 'string' && data ? data : undefined;
}

export function nodeName(node: unknown): string {
  const bubble = node as BubbleNode | null | undefined;
  if (!bubble) return '';
  const read = bubble.name?.();
  if (typeof read === 'string' && read) return read;
  return bubble.data?.name ?? '';
}

function matchesAnchor(
  node: unknown,
  anchor: FederationAnchor | null,
): boolean {
  if (!anchor) return true;
  const dimension = nodeIs2d(node);
  return dimension === undefined || dimension === anchor.is2d;
}

export function pickGeometryNode(
  doc: ViewingDocument,
  anchor: FederationAnchor | null,
  view?: string,
): unknown {
  const root = doc.getRoot();
  if (view) {
    const wanted = root
      .search?.({ type: 'geometry' })
      .find((node) => nodeGuid(node) === view);
    if (wanted && matchesAnchor(wanted, anchor)) return wanted;
  }
  const preferred = root.getDefaultGeometry();
  if (!preferred) {
    const any = root.search?.({ type: 'geometry' })[0];
    if (!any) throw noGeometry(root.data?.status);
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
  throw new ModelLoadError('dimension', NO_MATCHING_VIEW_MESSAGE[role]);
}

export function nodeRole(node: unknown): '2d' | '3d' {
  const bubble = node as BubbleNode | null | undefined;
  const twoD = nodeIs2d(bubble);
  if (twoD !== undefined) return twoD ? '2d' : '3d';
  return bubble?.data?.role === '2d' ? '2d' : '3d';
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
