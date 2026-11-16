import { useMemo } from 'react';
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

export function ModelSummaryPanel({
  adapter,
  propertyNames = DEFAULT_SUMMARY_PROPERTIES,
  title = 'Model summary',
  className,
}: ModelSummaryPanelProps) {
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
        <p className="bsh-muted">Load a model to see its summary.</p>
      )}
      {resolved && state.status === 'loading' && (
        <p className="bsh-muted" role="status">
          Reading element properties
        </p>
      )}
      {state.status === 'error' && (
        <p className="bsh-error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && entries.length === 0 && (
        <p className="bsh-muted">No elements found.</p>
      )}
      {entries.length > 0 && <SummaryTable entries={entries} />}
    </section>
  );
}
