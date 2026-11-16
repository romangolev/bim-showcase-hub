import { useMemo, useState } from 'react';
import { StateBlock } from '../components/StateBlock.js';
import {
  DEFAULT_SUMMARY_PROPERTIES,
  type SummaryEntry,
  summarize,
} from '../extensions/modelSummary.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { SummaryTable } from './SummaryTable.js';
import { usePropertyRows, useResolvedAdapter } from './usePropertyRows.js';
import './panels.css';

export interface ModelSummaryPanelProps {
  adapter?: ViewerAdapter | null;
  propertyNames?: readonly string[];
  title?: string;
  className?: string;
}

const EMPTY: SummaryEntry[] = [];
export const STACKED_ROW_LIMIT = 12;

export function ModelSummaryPanel({
  adapter,
  propertyNames = DEFAULT_SUMMARY_PROPERTIES,
  title = 'Model summary',
  className,
}: ModelSummaryPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const resolved = useResolvedAdapter(adapter);
  const state = usePropertyRows(resolved, propertyNames);
  const entries = useMemo(
    () =>
      state.status === 'ready' ? summarize(state.rows, propertyNames) : EMPTY,
    [state.status, state.rows, propertyNames],
  );

  return (
    <section
      className={`bsh-card ${className ?? ''}`.trim()}
      aria-labelledby="bsh-summary-title"
      data-rows-collapsed={!showAll && entries.length > STACKED_ROW_LIMIT}
    >
      <header className="bsh-card__header">
        <h2 id="bsh-summary-title" className="bsh-card__title">
          {title}
        </h2>
        <button
          type="button"
          className="bsh-button"
          onClick={state.reload}
          disabled={!resolved}
        >
          Refresh
        </button>
      </header>
      {!resolved && (
        <StateBlock
          variant="empty"
          title="No model loaded yet"
          message="Select a viewable version in the document tree and its element summary appears here."
        />
      )}
      {resolved && state.status === 'loading' && (
        <StateBlock
          variant="loading"
          message="Reading element properties"
          rows={5}
        />
      )}
      {state.status === 'error' && (
        <StateBlock
          variant="error"
          message="We could not read this model's properties. Try again."
          detail={state.message}
          action={{ label: 'Retry', onClick: state.reload }}
        />
      )}
      {state.status === 'ready' && entries.length === 0 && (
        <StateBlock
          variant="empty"
          title="No elements to summarize"
          message="This version has no readable elements. Try another version."
          action={{ label: 'Refresh', onClick: state.reload }}
        />
      )}
      {entries.length > 0 && <SummaryTable entries={entries} />}
      {entries.length > STACKED_ROW_LIMIT && (
        <button
          type="button"
          className="bsh-button summary-toggle"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? 'Show fewer rows' : `Show all ${entries.length} rows`}
        </button>
      )}
    </section>
  );
}
