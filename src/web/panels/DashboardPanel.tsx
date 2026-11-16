import { useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
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
      className={`bsh-card bsh-drawer ${className ?? ''}`.trim()}
      aria-labelledby={`${uid}-title`}
      data-collapsed={isCollapsed}
    >
      <header className="bsh-card__header bsh-drawer__header">
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
          <Icon
            name="chevron"
            size={16}
            className="bsh-drawer__toggle-icon"
            data-expanded={!isCollapsed}
          />
          <span className="bsh-drawer__toggle-label">
            {isCollapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
        {chart && options.length > 0 && !isCollapsed ? (
          <div className="bsh-field">
            <span aria-hidden="true">Group by</span>
            <label htmlFor={selectId} className="bsh-sr-only">
              Group elements by
            </label>
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
        ) : null}
      </header>
      <div
        id={bodyId}
        className="bsh-drawer__body"
        inert={isCollapsed}
        aria-hidden={isCollapsed || undefined}
      >
        {!resolved && (
          <StateBlock
            variant="empty"
            compact
            title="No charts yet"
            message="Open a viewable version to chart its elements."
          />
        )}
        {resolved && state.status === 'loading' && (
          <StateBlock
            variant="loading"
            compact
            message="Reading element properties"
            rows={3}
          />
        )}
        {state.status === 'error' && (
          <StateBlock
            variant="error"
            compact
            message="We could not read this model's properties. Try again."
            detail={state.message}
            action={{ label: 'Retry', onClick: state.reload }}
          />
        )}
        {chart && options.length > 0 && (
          <>
            <div className="bsh-charts">
              <ChartCanvas
                kind="bar"
                chart={chart}
                label={`Bar chart of element counts by ${chart.property}`}
              />
              <ChartCanvas
                kind="doughnut"
                chart={chart}
                label={`Doughnut chart of element share by ${chart.property}`}
              />
            </div>
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
          <StateBlock
            variant="empty"
            compact
            title="Nothing to chart"
            message="This version has no properties to group elements by."
          />
        )}
      </div>
    </section>
  );
}
