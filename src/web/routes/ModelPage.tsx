import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import {
  DashboardPanel,
  ExportButton,
  ModelSummaryPanel,
  PaintToolbar,
} from '../panels/index.js';
import { ViewerPane, ViewerProvider } from '../viewer/index.js';

export const DASHBOARD_STORAGE_KEY = 'bsh.dashboard.collapsed';
export const DASHBOARD_AUTO_COLLAPSE_HEIGHT = 900;

export function middleEllipsis(value: string, head: number, tail: number) {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function readDashboardCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (stored === '1') {
      return true;
    }
    if (stored === '0') {
      return false;
    }
  } catch {
    return window.innerHeight < DASHBOARD_AUTO_COLLAPSE_HEIGHT;
  }
  return window.innerHeight < DASHBOARD_AUTO_COLLAPSE_HEIGHT;
}

function writeDashboardCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(DASHBOARD_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    return;
  }
}

function UrnControl({ urn }: { urn: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(urn);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  return (
    <div className="urn-control">
      <code className="urn-control__value mono" title={urn}>
        {middleEllipsis(urn, 8, 6)}
      </code>
      <button
        type="button"
        className="icon-button"
        aria-label="Copy URN"
        title="Copy URN"
        onClick={() => void copy()}
      >
        <Icon name={state === 'copied' ? 'check' : 'copy'} size={14} />
      </button>
      <span className="visually-hidden" role="status">
        {state === 'copied'
          ? 'URN copied'
          : state === 'failed'
            ? 'Copy failed'
            : ''}
      </span>
    </div>
  );
}

export interface ModelPageProps {
  urn: string;
  file?: string;
  version?: string;
  crumbs?: readonly string[];
}

export function ModelPage({ urn, file, version, crumbs }: ModelPageProps) {
  const [dashboardCollapsed, setDashboardCollapsed] = useState(
    readDashboardCollapsed,
  );

  const updateCollapsed = (next: boolean) => {
    setDashboardCollapsed(next);
    writeDashboardCollapsed(next);
  };

  return (
    <ViewerProvider>
      <div className="model-page">
        <div className="model-stage">
          <header className="model-head">
            {crumbs && crumbs.length > 0 ? (
              <nav aria-label="Breadcrumb" className="crumbs">
                <ol className="crumbs__list">
                  {crumbs.map((name, index) => {
                    const path = crumbs.slice(0, index + 1).join('/');
                    return (
                      <li key={path} className="crumbs__item" title={name}>
                        {name}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            ) : null}
            <div className="model-head__row">
              <h1 className="model-title">
                {file ? (
                  <span className="model-title__name" title={file}>
                    {file}
                  </span>
                ) : (
                  <>
                    <span className="model-title__name">Model</span>
                    <span className="model-tag mono">
                      {middleEllipsis(urn, 6, 4)}
                    </span>
                  </>
                )}
                {version ? <span className="model-tag">{version}</span> : null}
              </h1>
              <UrnControl urn={urn} />
            </div>
          </header>
          <div className="model-toolbar">
            <PaintToolbar />
            <ExportButton />
          </div>
          <section className="model-viewer" aria-label="Viewer">
            <ViewerPane urn={urn} paintBrushes={false} />
          </section>
          <div className="model-dashboard" data-open={!dashboardCollapsed}>
            <DashboardPanel
              collapsed={dashboardCollapsed}
              onCollapsedChange={updateCollapsed}
            />
          </div>
        </div>
        <aside className="model-summary" aria-label="Model summary">
          <ModelSummaryPanel />
        </aside>
      </div>
    </ViewerProvider>
  );
}
