import { useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
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

export interface SummaryModel {
  label: string;
  tooltip: string;
}

export interface ModelSummaryPanelProps {
  adapter?: ViewerAdapter | null;
  model?: SummaryModel | null;
  propertyNames?: readonly string[];
  title?: string;
  className?: string;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  toggleable?: boolean;
}

const EMPTY: SummaryEntry[] = [];
export const STACKED_ROW_LIMIT = 12;

export function ModelSummaryPanel({
  adapter,
  model,
  propertyNames = DEFAULT_SUMMARY_PROPERTIES,
  title = 'Model summary',
  className,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  toggleable = true,
}: ModelSummaryPanelProps) {
  const uid = useId();
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? innerCollapsed;
  const [showAll, setShowAll] = useState(false);
  const resolved = useResolvedAdapter(adapter);
  const state = usePropertyRows(resolved, propertyNames);
  const entries = useMemo(
    () =>
      state.status === 'ready' ? summarize(state.rows, propertyNames) : EMPTY,
    [state.status, state.rows, propertyNames],
  );

  const toggle = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInnerCollapsed(next);
    onCollapsedChange?.(next);
  };

  const bodyId = `${uid}-body`;
  const titleId = `${uid}-title`;
  const toggleLabel = isCollapsed ? `Expand ${title}` : `Collapse ${title}`;

  return (
    <section
      className={`bsh-card bsh-summary ${className ?? ''}`.trim()}
      aria-labelledby={titleId}
      data-collapsed={isCollapsed}
      data-rows-collapsed={!showAll && entries.length > STACKED_ROW_LIMIT}
    >
      <header className="bsh-card__header bsh-summary__header">
        <h2 id={titleId} className="bsh-card__title bsh-summary__title">
          {title}
          {model ? (
            <span className="bsh-summary__model" title={model.tooltip}>
              <span className="bsh-sr-only">: </span>
              {model.label}
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          className="bsh-button bsh-summary__refresh"
          onClick={state.reload}
          disabled={!resolved}
        >
          Refresh
        </button>
        {toggleable ? (
          <button
            type="button"
            className="bsh-icon-button bsh-summary__toggle"
            aria-expanded={!isCollapsed}
            aria-controls={bodyId}
            onClick={toggle}
          >
            <Icon
              name="chevron"
              size={16}
              className="bsh-summary__toggle-icon"
              data-expanded={!isCollapsed}
            />
            <span className="bsh-sr-only">{toggleLabel}</span>
          </button>
        ) : null}
      </header>
      <div
        id={bodyId}
        className="bsh-summary__wrap"
        inert={isCollapsed}
        aria-hidden={isCollapsed || undefined}
      >
        <div className="bsh-summary__body">
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
        </div>
      </div>
    </section>
  );
}
