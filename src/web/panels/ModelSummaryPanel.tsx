import { useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import {
  itemsWithValues,
  runElementAction,
  showAllElements,
} from '../extensions/elementActions.js';
import { saveBlob } from '../extensions/excelExport.js';
import { applyNamePattern, toDelimited } from '../extensions/exportFormats.js';
import {
  DEFAULT_SUMMARY_PROPERTIES,
  emptyShares,
  type SummaryEntry,
  type SummaryView,
  summarize,
  summaryTable,
  viewEntries,
} from '../extensions/modelSummary.js';
import { PANE_SETTINGS, usePaneSetting } from '../settings/paneSettings.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  ModelScopeSelect,
  UnavailableModels,
  useModelScope,
} from './ModelScope.js';
import { entryKey, SummaryTable } from './SummaryTable.js';
import {
  HIDDEN_MESSAGE,
  HIDDEN_TITLE,
  usePropertyRows,
  useResolvedAdapter,
} from './usePropertyRows.js';
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
  onOpenSettings?: () => void;
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
  onOpenSettings,
}: ModelSummaryPanelProps) {
  const uid = useId();
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? innerCollapsed;
  const [showAll, setShowAll] = useState(false);
  const resolved = useResolvedAdapter(adapter);
  const state = usePropertyRows(resolved, propertyNames);
  const scope = useModelScope(resolved, state.rows);
  const entries = useMemo(
    () =>
      state.status === 'ready' ? summarize(scope.rows, propertyNames) : EMPTY,
    [state.status, scope.rows, propertyNames],
  );

  const [view, setView] = usePaneSetting(PANE_SETTINGS.summary.view);
  const [action] = usePaneSetting(PANE_SETTINGS.summary.action);
  const [active, setActive] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const shown = useMemo(() => viewEntries(entries, view), [entries, view]);
  const shares = useMemo(
    () => emptyShares(entries).filter((share) => share.percent > 0),
    [entries],
  );
  const patch = (next: Partial<SummaryView>) =>
    setView((prev) => ({ ...prev, ...next }));

  const pick = (entry: SummaryEntry) => {
    if (!resolved) return;
    runElementAction(
      resolved,
      action,
      itemsWithValues(scope.rows, entry.property, new Set([entry.value])),
    );
    setActive(entryKey(entry));
  };

  const table = () => summaryTable(shown, view.hiddenColumns);
  const copyTable = async () => {
    const { header, rows } = table();
    try {
      await navigator.clipboard.writeText(toDelimited(header, rows, '\t'));
      setNotice(`Copied ${rows.length} rows`);
    } catch {
      setNotice('Could not copy to the clipboard');
    }
  };
  const downloadCsv = () => {
    const { header, rows } = table();
    saveBlob(
      new Blob(['\uFEFF', toDelimited(header, rows, ',')], {
        type: 'text/csv;charset=utf-8',
      }),
      applyNamePattern('{model}-summary', model?.label ?? 'model', 'csv'),
    );
  };

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
      data-density={view.density}
      data-rows-collapsed={!showAll && shown.length > STACKED_ROW_LIMIT}
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
        <ModelScopeSelect state={scope} label="Summarize models" />
        <button
          type="button"
          className="bsh-button bsh-summary__refresh"
          onClick={state.reload}
          disabled={!resolved}
        >
          Refresh
        </button>
        {onOpenSettings ? (
          <button
            type="button"
            className="bsh-icon-button"
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={16} />
            <span className="bsh-sr-only">Summary settings</span>
          </button>
        ) : null}
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
          {state.status === 'ready' ? (
            <UnavailableModels models={scope.unavailable} />
          ) : null}
          {!resolved && (
            <StateBlock
              variant="empty"
              title="No model loaded yet"
              message="Select a viewable version in the document tree and its element summary appears here."
            />
          )}
          {state.status === 'hidden' && (
            <StateBlock
              variant="empty"
              title={HIDDEN_TITLE}
              message={HIDDEN_MESSAGE}
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
          {entries.length > 0 && (
            <div className="bsh-summary__tools">
              <input
                type="search"
                className="bsh-input"
                aria-label="Filter summary rows"
                placeholder="Filter"
                value={view.text}
                onChange={(e) => patch({ text: e.target.value })}
              />
              <button type="button" className="bsh-button" onClick={copyTable}>
                Copy table
              </button>
              <button
                type="button"
                className="bsh-button"
                onClick={downloadCsv}
              >
                Download CSV
              </button>
              <span role="status" className="bsh-summary__notice">
                {notice}
              </span>
              <button
                type="button"
                className="bsh-button"
                onClick={() => resolved && showAllElements(resolved)}
              >
                Show all elements
              </button>
              {shares.length > 0 && (
                <ul className="bsh-summary__shares" aria-label="Empty values">
                  {shares.map((share) => (
                    <li key={share.property} className="bsh-badge">
                      {share.property}: {share.percent}% empty
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {entries.length > 0 && shown.length === 0 && (
            <StateBlock
              variant="empty"
              compact
              title="No rows match"
              message="Change the filter, or reset the view in Summary settings."
            />
          )}
          {shown.length > 0 && (
            <SummaryTable
              entries={shown}
              hiddenColumns={view.hiddenColumns}
              activeKey={active}
              onPick={pick}
            />
          )}
          {shown.length > STACKED_ROW_LIMIT && (
            <button
              type="button"
              className="bsh-button summary-toggle"
              aria-expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer rows' : `Show all ${shown.length} rows`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
