import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import {
  DashboardPanel,
  ExportButton,
  ModelSummaryPanel,
  PaintToolbar,
} from '../panels/index.js';
import { ViewerPane, ViewerProvider } from '../viewer/index.js';

function CopyUrnButton({ urn }: { urn: string }) {
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
    <>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => void copy()}
      >
        <Icon name={state === 'copied' ? 'check' : 'copy'} size={14} />
        Copy URN
      </button>
      <span className="visually-hidden" role="status">
        {state === 'copied'
          ? 'URN copied'
          : state === 'failed'
            ? 'Copy failed'
            : ''}
      </span>
    </>
  );
}

export function ModelPage({ urn }: { urn: string }) {
  const [dashboardCollapsed, setDashboardCollapsed] = useState(false);

  return (
    <ViewerProvider>
      <div className="model-page">
        <div className="model-bar">
          <h1 className="model-bar__title">Model</h1>
          <code className="model-bar__urn" title={urn}>
            {urn}
          </code>
          <CopyUrnButton urn={urn} />
        </div>
        <div className="model-toolbar">
          <PaintToolbar />
          <ExportButton />
        </div>
        <div className="model-main">
          <section className="model-viewer" aria-label="Viewer">
            <ViewerPane urn={urn} />
          </section>
          <aside className="model-summary" aria-label="Model summary">
            <ModelSummaryPanel />
          </aside>
        </div>
        <div className="model-dashboard" data-open={!dashboardCollapsed}>
          <DashboardPanel
            collapsed={dashboardCollapsed}
            onCollapsedChange={setDashboardCollapsed}
          />
        </div>
      </div>
    </ViewerProvider>
  );
}
