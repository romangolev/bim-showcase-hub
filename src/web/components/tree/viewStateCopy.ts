import { type ViewState, viewableFor } from '../../../shared/viewState.js';

const ACTION =
  'Open the file in Revit or Navisworks and publish a 3D view, or re-translate.';

export interface ViewStateCopy {
  label: string;
  reason: string;
}

export const VIEW_STATE_COPY: Record<ViewState, ViewStateCopy> = {
  ready: { label: 'Viewable', reason: 'This version has a 3D or 2D view.' },
  unknown: {
    label: 'Viewable',
    reason: 'The translation status could not be checked. Try opening it.',
  },
  processing: {
    label: 'Processing',
    reason:
      'Autodesk is still translating this version. Try again in a minute.',
  },
  failed: {
    label: 'Translation failed',
    reason: `The translation of this version failed. ${ACTION}`,
  },
  'no-geometry': {
    label: 'No 3D or 2D view',
    reason: `This version was translated but has no 3D or 2D view. ${ACTION}`,
  },
  'not-translated': {
    label: 'Not translated',
    reason: `This version has not been translated yet. ${ACTION}`,
  },
};

export function viewStateOf(node: { viewState?: ViewState }): ViewState {
  return node.viewState ?? 'not-translated';
}

export function blockedNotice(node: {
  kind: string;
  viewState?: ViewState;
}): string | null {
  if (node.kind !== 'version') {
    return null;
  }
  const state = viewStateOf(node);
  return viewableFor(state) ? null : VIEW_STATE_COPY[state].reason;
}
