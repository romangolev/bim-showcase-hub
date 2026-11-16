import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useMemo } from 'react';
import {
  DEFAULT_SUMMARY_PROPERTIES,
  type SummaryEntry,
  summarize,
} from '../extensions/modelSummary.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { usePropertyRows, useResolvedAdapter } from './usePropertyRows.js';
import './panels.css';

export interface ModelSummaryPanelProps {
  adapter?: ViewerAdapter | null;
  propertyNames?: readonly string[];
  title?: string;
  className?: string;
}

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, SummaryEntry>();
const columns = helper.columns([
  helper.accessor('property', { header: 'Property' }),
  helper.accessor('value', { header: 'Value' }),
  helper.accessor('count', { header: 'Count' }),
]);

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
  const table = useTable({ features, columns, data: entries });

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
      {entries.length > 0 && (
        <div className="bsh-table-wrap">
          <table className="bsh-table">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      scope="col"
                      className={
                        header.column.id === 'count' ? 'bsh-num' : undefined
                      }
                    >
                      {header.isPlaceholder ? null : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={
                        cell.column.id === 'count' ? 'bsh-num' : undefined
                      }
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
