import { MAX_COMBINED_MODELS } from '../../shared/combined.js';
import { formatParts, summarizeCost } from './costSummary.js';
import type { ModelInfo } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';
import './viewer.css';

export interface CostMeterProps {
  adapter: ViewerAdapter | null;
  models: readonly ModelInfo[];
  warningOnly?: boolean;
}

export function costOf(
  adapter: ViewerAdapter | null,
  models: readonly ModelInfo[],
) {
  const weights = models
    .filter((model) => model.status === 'ready')
    .map((model) => adapter?.getModelWeight?.(model.id) ?? null);
  return summarizeCost(models.length, weights);
}

export function partsDetail(
  adapter: ViewerAdapter | null,
  models: readonly ModelInfo[],
): string | null {
  const { parts } = costOf(adapter, models);
  return parts === null ? null : `about ${formatParts(parts)} parts (estimate)`;
}

export function CostMeter({ adapter, models, warningOnly }: CostMeterProps) {
  const cost = costOf(adapter, models);
  if (warningOnly && !cost.warning) return null;
  return (
    <div className="bsh-viewer-cost" data-warn={cost.warning !== null}>
      {warningOnly ? null : (
        <span className="bsh-viewer-cost__count">
          {cost.count} of {MAX_COMBINED_MODELS} models
        </span>
      )}
      {!warningOnly && cost.parts !== null ? (
        <span
          className="bsh-viewer-cost__parts"
          title="Estimated from the number of geometry parts. Real memory use varies."
        >
          about {formatParts(cost.parts)} parts (estimate)
        </span>
      ) : null}
      {cost.warning ? (
        <span className="bsh-viewer-cost__warning" role="status">
          {cost.warning}
        </span>
      ) : null}
    </div>
  );
}
