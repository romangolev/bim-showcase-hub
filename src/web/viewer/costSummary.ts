import { MAX_COMBINED_MODELS } from '../../shared/combined.js';

export interface CostSummary {
  count: number;
  parts: number | null;
  warning: string | null;
}

export function summarizeCost(
  count: number,
  weights: readonly (number | null)[],
  cap = MAX_COMBINED_MODELS,
): CostSummary {
  const known = weights.filter((w): w is number => w !== null);
  const parts = known.length > 0 ? known.reduce((a, b) => a + b, 0) : null;
  let warning: string | null = null;
  if (count >= cap) {
    warning = `Limit reached: a combined view holds up to ${cap} models.`;
  } else if (count === cap - 1) {
    warning = 'One more model fits. Large combinations can be slow.';
  }
  return { count, parts, warning };
}

export function formatParts(parts: number): string {
  if (parts >= 1_000_000) return `${(parts / 1_000_000).toFixed(1)}M`;
  if (parts >= 1000) return `${Math.round(parts / 1000)}k`;
  return String(parts);
}
