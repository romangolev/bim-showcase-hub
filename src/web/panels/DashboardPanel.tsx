import { useEffect, useId, useMemo, useState } from 'react';
import {
  availableProperties,
  DEFAULT_DASHBOARD_PROPERTIES,
  DEFAULT_MAX_CATEGORIES,
  shapeChartData,
} from '../extensions/dashboardData.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ChartCanvas } from './ChartCanvas.js';
import { usePropertyRows, useResolvedAdapter } from './usePropertyRows.js';
import './panels.css';

export interface DashboardPanelProps {
  adapter?: ViewerAdapter | null;
  propertyNames?: readonly string[];
  defaultProperty?: string;
  maxCategories?: number;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  title?: string;
  className?: string;
}

export function DashboardPanel({
  adapter,
  propertyNames = DEFAULT_DASHBOARD_PROPERTIES,
  defaultProperty,
  maxCategories = DEFAULT_MAX_CATEGORIES,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  title = 'Dashboard',
  className,
}: DashboardPanelProps) {
  const uid = useId();
  const resolved = useResolvedAdapter(adapter);
  const state = usePropertyRows(resolved, propertyNames);
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? innerCollapsed;
  const [selected, setSelected] = useState(defaultProperty ?? propertyNames[0]);

  const options = useMemo(
    () =>
      state.status === 'ready'
        ? availableProperties(state.rows, propertyNames)
        : [],
    [state.status, state.rows, propertyNames],
  );

  useEffect(() => {
    if (options.length > 0 && (!selected || !options.includes(selected))) {
      setSelected(options[0]);
    }
  }, [options, selected]);

  const chart = useMemo(
    () =>
      state.status === 'ready' && selected
        ? shapeChartData(state.rows, selected, maxCategories)
        : null,
    [state.status, state.rows, selected, maxCategories],
  );

  const toggle = () => {
    const next = !isCollapsed;
    if (collapsed === undefined) setInnerCollapsed(next);
    onCollapsedChange?.(next);
  };

  const bodyId = `${uid}-body`;
  const selectId = `${uid}-property`;

  return (
    <section
      className={`bsh-card ${className ?? ''}`.trim()}
      aria-labelledby={`${uid}-title`}
    >
      <header className="bsh-card__header">
        <h2 id={`${uid}-title`} className="bsh-card__title">
          {title}
        </h2>
        <button
          type="button"
          className="bsh-button"
          aria-expanded={!isCollapsed}
          aria-controls={bodyId}
          onClick={toggle}
        >
          {isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </header>
      <div id={bodyId} hidden={isCollapsed}>
        {!resolved && <p className="bsh-muted">Load a model to see charts.</p>}
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
        {chart && options.length > 0 && (
          <>
            <div className="bsh-field">
              <label htmlFor={selectId}>Group elements by</label>
              <select
                id={selectId}
                className="bsh-select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {options.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <ChartCanvas
              kind="bar"
              chart={chart}
              label={`Bar chart of element counts by ${chart.property}`}
            />
            <ChartCanvas
              kind="pie"
              chart={chart}
              label={`Pie chart of element counts by ${chart.property}`}
            />
            <details className="bsh-details">
              <summary>Data table</summary>
              <table className="bsh-table">
                <caption className="bsh-sr-only">
                  Element counts by {chart.property}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{chart.property}</th>
                    <th scope="col" className="bsh-num">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chart.data.map((d) => (
                    <tr key={d.label}>
                      <td>{d.label}</td>
                      <td className="bsh-num">{d.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
        {state.status === 'ready' && options.length === 0 && (
          <p className="bsh-muted">No properties available to chart.</p>
        )}
      </div>
    </section>
  );
}
