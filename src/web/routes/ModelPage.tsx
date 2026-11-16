import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';

export interface ModelSlotProps {
  urn: string;
}

export function ViewerSlot({ urn }: ModelSlotProps) {
  return (
    <div className="slot slot--viewer" data-slot="viewer" data-urn={urn}>
      <Icon name="model" size={32} />
      <span>ViewerSlot</span>
    </div>
  );
}

export function DashboardSlot({ urn }: ModelSlotProps) {
  return (
    <div className="slot" data-slot="dashboard" data-urn={urn}>
      <Icon name="chart" size={24} />
      <span>DashboardSlot</span>
    </div>
  );
}

export function SummarySlot({ urn }: ModelSlotProps) {
  return (
    <div className="slot" data-slot="summary" data-urn={urn}>
      <Icon name="table" size={24} />
      <span>SummarySlot</span>
    </div>
  );
}

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
  const [dashboardOpen, setDashboardOpen] = useState(true);

  return (
    <div className="model-page">
      <div className="model-bar">
        <h1 className="model-bar__title">Model</h1>
        <code className="model-bar__urn" title={urn}>
          {urn}
        </code>
        <CopyUrnButton urn={urn} />
      </div>
      <div className="model-main">
        <section className="model-viewer" aria-label="Viewer">
          <ViewerSlot urn={urn} />
        </section>
        <aside className="model-summary" aria-label="Model summary">
          <SummarySlot urn={urn} />
        </aside>
      </div>
      <section
        className="model-dashboard"
        aria-label="Dashboard"
        data-open={dashboardOpen}
      >
        <button
          type="button"
          className="model-dashboard__toggle"
          aria-expanded={dashboardOpen}
          aria-controls="model-dashboard-body"
          onClick={() => setDashboardOpen((value) => !value)}
        >
          <Icon name="chevron" size={14} className="model-dashboard__chevron" />
          Dashboard
        </button>
        <div
          id="model-dashboard-body"
          className="model-dashboard__body"
          hidden={!dashboardOpen}
        >
          <DashboardSlot urn={urn} />
        </div>
      </section>
    </div>
  );
}
