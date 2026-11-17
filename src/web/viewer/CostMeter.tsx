import { MAX_COMBINED_MODELS } from '../../shared/combined.js';
import { formatParts, summarizeCost } from './costSummary.js';
import type { ModelInfo } from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export interface CostMeterProps {
  adapter: ViewerAdapter | null;
  models: readonly ModelInfo[];
}

export function CostMeter({ adapter, models }: CostMeterProps) {
  const weights = models
    .filter((model) => model.status === 'ready')
    .map((model) => adapter?.getModelWeight?.(model.id) ?? null);
  const cost = summarizeCost(models.length, weights);
  return (
    <div className="bsh-viewer-cost" data-warn={cost.warning !== null}>
      <span className="bsh-viewer-cost__count">
        {cost.count} of {MAX_COMBINED_MODELS} models
      </span>
      {cost.parts !== null ? (
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
