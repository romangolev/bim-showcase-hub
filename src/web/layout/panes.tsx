import { useParams, useRouterState } from '@tanstack/react-router';
import { useOpenModels, useOpenModelsStore } from '../api/useOpenModels.js';
import { StateBlock } from '../components/StateBlock.js';
import { TreePanel } from '../components/TreePanel.js';
import { DashboardPanel, ModelSummaryPanel } from '../panels/index.js';
import { ViewerPane } from '../viewer/index.js';
import { useLayout, useMainContent } from './layoutContext.js';
import { instancePanelId } from './panelIds.js';

export const MODEL_KIND = 'viewer';

export function modelPanelId(urn: string): string {
  return instancePanelId(MODEL_KIND, urn);
}

export function useModelUrn(): string | null {
  const { urn } = useParams({ strict: false }) as { urn?: string };
  const onModel = useRouterState({
    select: (state) => state.location.pathname.startsWith('/model/'),
  });
  return onModel && urn ? urn : null;
}

export function TreePane() {
  const layout = useLayout();
  return <TreePanel onNavigate={layout.closeTreeOverlay} />;
}

export function ViewerPaneBody() {
  const content = useMainContent();
  return (
    <main id="main" className="pane-main" tabIndex={-1}>
      {content}
    </main>
  );
}

export function ModelPaneBody({ instance }: { instance: string }) {
  const layout = useLayout();
  const state = useOpenModels();
  const store = useOpenModelsStore();
  const panel = modelPanelId(instance);
  const active = state.active === instance;
  const live = state.live.includes(instance);
  const title = layout.paneTitle(panel);
  return (
    <section
      id={active ? 'main' : undefined}
      role={active ? 'main' : undefined}
      aria-label={title.label}
      className="pane-main pane-model"
      tabIndex={-1}
      data-route="model"
      data-model={instance}
      data-active={active}
      data-live={live}
    >
      <section className="model-viewer" aria-label="Model viewer">
        {live ? (
          <ViewerPane
            urn={instance}
            resizeSignal={layout.resizeSignal(panel)}
          />
        ) : (
          <div className="bsh-viewer-pane" data-state="paused">
            <div className="bsh-viewer-overlay">
              <StateBlock
                variant="empty"
                title="Paused to save memory"
                message="Only a few models stay loaded at once. Load this one again to keep working with it."
                action={{
                  label: 'Load model',
                  onClick: () => store?.activate(instance),
                  primary: true,
                }}
              />
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function useActiveModelTitle() {
  const layout = useLayout();
  const { active } = useOpenModels();
  return active ? layout.paneTitle(modelPanelId(active)) : null;
}

export function SummaryPane() {
  const layout = useLayout();
  const model = useActiveModelTitle();
  return (
    <aside className="pane-summary" aria-label="Model summary">
      <ModelSummaryPanel
        model={model}
        collapsed={layout.mode === 'stacked' && layout.isCollapsed('summary')}
        toggleable={layout.mode === 'stacked'}
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
        collapsed={layout.mode === 'stacked' && layout.isCollapsed('dashboard')}
        toggleable={layout.mode === 'stacked'}
        onCollapsedChange={(next) => layout.setCollapsed('dashboard', next)}
      />
    </div>
  );
}
