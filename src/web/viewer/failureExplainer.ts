import type { FailureReason } from './modelSet.js';

export interface FailureExplanation {
  title: string;
  text: string;
  retry: boolean;
}

const EXPLANATIONS: Record<FailureReason, FailureExplanation> = {
  processing: {
    title: 'Still processing',
    text: 'Autodesk is still translating this file for the viewer. Try again in a few minutes.',
    retry: true,
  },
  access: {
    title: 'No access',
    text: 'You do not have access to this file. Ask its owner for access, then try again.',
    retry: true,
  },
  missing: {
    title: 'Not found',
    text: 'The viewer could not find this file. It may not be translated yet, it may have moved, or you may not have access.',
    retry: true,
  },
  dimension: {
    title: 'Different kind of view',
    text: 'This file has only sheets or only 3D views, which cannot be combined with the other models. Open it in its own tab.',
    retry: false,
  },
  region: {
    title: 'Another region',
    text: 'This file is stored in another region. Open it in its own tab.',
    retry: false,
  },
  'no-viewable': {
    title: 'Nothing to show',
    text: 'This file was translated but has no 3D or 2D view. Open the source file and publish a view.',
    retry: false,
  },
  unknown: {
    title: 'Model unavailable',
    text: 'The model could not be loaded. It may still be processing, or you may not have access to it.',
    retry: true,
  },
};

export function explainFailure(
  reason: FailureReason | undefined,
): FailureExplanation {
  return EXPLANATIONS[reason ?? 'unknown'];
}
