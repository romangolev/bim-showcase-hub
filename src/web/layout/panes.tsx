import { useParams, useRouter, useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';
import { withUrns } from '../api/modelContext.js';
import { recallModel } from '../api/modelStore.js';
import { contextOf } from '../api/openModels.js';
import { useOpenModels, useOpenModelsStore } from '../api/useOpenModels.js';
import { StateBlock } from '../components/StateBlock.js';
import { useTreeControl } from '../components/TreeControl.js';
import { TreePanel } from '../components/TreePanel.js';
import { exportFileName } from '../extensions/excelExport.js';
import { DashboardPanel, ModelSummaryPanel } from '../panels/index.js';
import { memberLabel } from '../routes/ModelPage.js';
import { ViewerPane } from '../viewer/index.js';
import { page } from '../viewer/region.js';
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
  const content = useMainContent();
  const { active } = useOpenModels();
  const home = active === null;
  return (
    <div
      id={home ? 'main' : undefined}
      role={home ? 'main' : undefined}
      className="pane-docs"
      data-home={home}
      tabIndex={-1}
    >
      <TreePanel onNavigate={layout.closeTreeOverlay} />
      {home ? <div className="pane-docs__hint">{content}</div> : null}
    </div>
  );
}

export function ModelPaneBody({ instance }: { instance: string }) {
  const layout = useLayout();
  const state = useOpenModels();
  const store = useOpenModelsStore();
  const panel = modelPanelId(instance);
  const active = state.active === instance;
  const live = state.live.includes(instance);
  const context = contextOf(state, instance);
  const entry = state.models.find((model) => model.urn === instance);
  const title = layout.paneTitle(panel);
  const tree = useTreeControl();
  const router = useRouter();
  const extras = withUrns(context);
  const memberKey = extras.join(',');
  const members = useMemo(
    () =>
      memberKey
        ? memberKey.split(',').map((urn) => ({
            urn,
            name: memberLabel(urn, recallModel(urn)),
          }))
        : [],
    [memberKey],
  );
  const exportName =
    members.length > 0
      ? exportFileName(`${members.length + 1} models`)
      : exportFileName(context?.file, context?.v);
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
            exportName={exportName}
            name={memberLabel(instance, context)}
            members={members}
            onRemoveModel={(urn) => store?.removeFrom(instance, urn)}
            offsets={entry?.offsets ?? null}
            onOffsetsChange={(next) =>
              store?.setView(instance, { offsets: next })
            }
            onSpreadChange={(spread) => store?.setView(instance, { spread })}
            onAddModel={tree ? () => tree.reveal() : undefined}
            onKeepOnly={() => {
              store?.keepOnly(instance);
              page.go(
                router.buildLocation({
                  to: '/model/$urn',
                  params: { urn: instance },
                  search: context ?? {},
                }).href,
              );
            }}
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
