import { useParams, useRouterState } from '@tanstack/react-router';
import { TreePanel } from '../components/TreePanel.js';
import { DashboardPanel, ModelSummaryPanel } from '../panels/index.js';
import { ViewerPane } from '../viewer/index.js';
import { useLayout, useMainContent } from './layoutContext.js';

export function useModelUrn(): string | null {
  const { urn } = useParams({ strict: false }) as { urn?: string };
  const onModel = useRouterState({
    select: (state) => state.location.pathname.startsWith('/model/'),
  });
  return onModel && urn ? urn : null;
}

export function TreePane() {
  const layout = useLayout();
  return (
    <TreePanel
      resizable={layout.mode !== 'dock'}
      onNavigate={layout.closeTreeOverlay}
    />
  );
}

export function ViewerPaneBody() {
  const layout = useLayout();
  const content = useMainContent();
  const urn = useModelUrn();
  return (
    <main
      id="main"
      className="pane-main"
      tabIndex={-1}
      data-route={urn ? 'model' : undefined}
    >
      {content}
      {urn ? (
        <section className="model-viewer" aria-label="Viewer">
          <ViewerPane urn={urn} resizeSignal={layout.resizeSignal('viewer')} />
        </section>
      ) : null}
    </main>
  );
}

export function SummaryPane() {
  const layout = useLayout();
  return (
    <aside className="pane-summary" aria-label="Model summary">
      <ModelSummaryPanel
        collapsed={layout.isCollapsed('summary')}
        onCollapsedChange={(next) => layout.setCollapsed('summary', next)}
      />
    </aside>
  );
}

export function DashboardPane() {
  const layout = useLayout();
  return (
    <div className="pane-dashboard">
      <DashboardPanel
        collapsed={layout.isCollapsed('dashboard')}
        onCollapsedChange={(next) => layout.setCollapsed('dashboard', next)}
      />
    </div>
  );
}
