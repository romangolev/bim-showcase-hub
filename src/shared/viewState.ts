export const VIEW_STATES = [
  'ready',
  'processing',
  'failed',
  'no-geometry',
  'not-translated',
  'unknown',
] as const;

export type ViewState = (typeof VIEW_STATES)[number];

export function viewableFor(state: ViewState): boolean {
  return state === 'ready' || state === 'unknown';
}
