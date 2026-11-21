import {
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { withUrns } from '../api/modelContext.js';
import {
  modelStoreVersion,
  recallModel,
  subscribeModelStore,
} from '../api/modelStore.js';
import { memberLabel, memberMeta } from '../api/modelTitles.js';
import { contextOf } from '../api/openModels.js';
import { useOpenModels, useOpenModelsStore } from '../api/useOpenModels.js';
import { StateBlock } from '../components/StateBlock.js';
import { useTreeControl } from '../components/TreeControl.js';
import { TreePanel } from '../components/TreePanel.js';
import { DEFAULT_FILE_NAME } from '../extensions/excelExport.js';
import { useModal } from '../modal/ModalContext.js';
import { DASHBOARD_SETTINGS_ID } from '../panels/DashboardSettings.js';
import {
  DashboardPanel,
  MeasurementsPanel,
  ModelSummaryPanel,
  ModelsPanel,
  PropertiesPanel,
} from '../panels/index.js';
import { MODEL_TINTS } from '../panels/modelTint.js';
import { SUMMARY_SETTINGS_ID } from '../panels/SummarySettings.js';
import { VIEWPOINTS_MODAL_ID } from '../panels/Viewpoints.js';
import { usePersisted } from '../storage.js';
import { notify } from '../tasks/notifications.js';
import { exportFileName, exportStem } from '../tools/kernel/exportKit.js';
import { page } from '../viewer/region.js';
import {
  captureFederation,
  FEDERATIONS,
  federationOpenPlan,
  latestVersionUrn,
  resolveFederation,
  setFederationOpener,
  withFederationHidden,
  withFederationTints,
} from '../viewer/savedFederations.js';
import {
  HIDDEN_MODELS,
  MAX_HIDDEN_URNS,
} from '../viewer/useModelVisibilityMemory.js';
import { ViewerPane } from '../viewer/ViewerPane.js';
import { setDashboardSettingsTarget } from './dashboardTarget.js';
import {
  chartSetting,
  propertiesSetting,
  summarySetting,
} from './instanceSettings.js';
import { useLayout, useMainContent } from './layoutContext.js';
import { instancePanelId } from './panelIds.js';
import { setSummarySettingsTarget } from './summaryTarget.js';

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

export function pausedCopy(count: number): {
  message: string;
  action: string;
} {
  return count > 1
    ? {
        message: `This tab holds ${count} models. Only a few models stay loaded at once. Load them again to keep working with them.`,
        action: 'Load models',
      }
    : {
        message:
          'Only a few models stay loaded at once. Load this one again to keep working with it.',
        action: 'Load model',
      };
}

export function TreePane() {
  const layout = useLayout();
  const content = useMainContent();
  const { active } = useOpenModels();
  const home = active === null;
  const routed = useModelUrn() !== null;
  return (
    <div
      id={home ? 'main' : undefined}
      role={home ? 'main' : undefined}
      className="pane-docs"
      data-home={home}
      tabIndex={-1}
    >
      <TreePanel onNavigate={layout.closeTreeOverlay} />
      {home || !routed ? (
        <div className="pane-docs__hint">{content}</div>
      ) : null}
    </div>
  );
}

export function ModelPaneBody({ instance }: { instance: string }) {
  const layout = useLayout();
  const modal = useModal();
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
  const routeView = (useSearch({ strict: false }) as { view?: unknown }).view;
  const extras = withUrns(context);
  const memberKey = extras.join(',');
  const recalled = useSyncExternalStore(
    subscribeModelStore,
    modelStoreVersion,
    modelStoreVersion,
  );
  const members = useMemo(
    () =>
      memberKey && recalled >= 0
        ? memberKey.split(',').map((urn) => ({
            urn,
            name: memberLabel(urn, recallModel(urn)),
            ...memberMeta(recallModel(urn)),
          }))
        : [],
    [memberKey, recalled],
  );
  const version = context?.v;
  const path = context?.crumbs?.join(' / ');
  const meta = useMemo(
    () => memberMeta({ v: version, crumbs: path ? [path] : [] }),
    [version, path],
  );
  const exportName = exportFileName(
    members.length > 0
      ? exportStem(`${members.length + 1} models`)
      : exportStem(context?.file, context?.v),
    DEFAULT_FILE_NAME,
    '-properties',
    'xlsx',
  );
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
            meta={meta}
            members={members}
            onRemoveModel={(urn) => store?.removeFrom(instance, urn)}
            offsets={entry?.offsets ?? null}
            onOffsetsChange={(next) =>
              store?.setView(instance, { offsets: next })
            }
            onSpreadChange={(spread) => store?.setView(instance, { spread })}
            savedState={entry?.state ?? null}
            onSaveState={
              entry?.remember === false
                ? undefined
                : (state) => store?.setView(instance, { state })
            }
            initialView={
              active && typeof routeView === 'string' ? routeView : null
            }
            onViewConsumed={() =>
              void router.navigate({
                to: '/model/$urn',
                params: { urn: instance },
                search: context ?? {},
                replace: true,
              })
            }
            onManageViewpoints={() => modal.open(VIEWPOINTS_MODAL_ID)}
            onPresent={() => layout.setPresenting(true)}
            shareHref={
              new URL(
                router.buildLocation({
                  to: '/model/$urn',
                  params: { urn: instance },
                  search: context ?? {},
                }).href,
                window.location.origin,
              ).href
            }
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
                message={pausedCopy(members.length + 1).message}
                action={{
                  label: pausedCopy(members.length + 1).action,
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
  const modal = useModal();
  return (
    <aside className="pane-summary" aria-label="Model summary">
      <ModelSummaryPanel
        model={model}
        onOpenSettings={() => {
          setSummarySettingsTarget(null);
          modal.open(SUMMARY_SETTINGS_ID);
        }}
        collapsed={layout.mode === 'stacked' && layout.isCollapsed('summary')}
        toggleable={layout.mode === 'stacked'}
        onCollapsedChange={(next) => layout.setCollapsed('summary', next)}
      />
    </aside>
  );
}

export function SummaryInstancePane({ instance }: { instance: string }) {
  const layout = useLayout();
  const modal = useModal();
  const panel = instancePanelId('modelSummary', instance);
  const [spec, setSpec] = usePersisted(summarySetting(panel));
  return (
    <aside className="pane-summary" aria-label="Model summary">
      <ModelSummaryPanel
        title={layout.paneTitle(panel).label}
        toggleable={false}
        onOpenSettings={() => {
          setSummarySettingsTarget(panel);
          modal.open(SUMMARY_SETTINGS_ID);
        }}
        propertyNames={spec.properties}
        view={{
          value: spec.view,
          onChange: (view) => setSpec((prev) => ({ ...prev, view })),
        }}
        action={spec.action}
        scope={{
          value: spec.scope,
          onChange: (scope) => setSpec((prev) => ({ ...prev, scope })),
        }}
        elements={{
          value: spec.elements,
          onChange: (elements) => setSpec((prev) => ({ ...prev, elements })),
        }}
      />
    </aside>
  );
}

export function DashboardPane() {
  const layout = useLayout();
  const modal = useModal();
  return (
    <div className="pane-dashboard">
      <DashboardPanel
        onOpenSettings={() => {
          setDashboardSettingsTarget(null);
          modal.open(DASHBOARD_SETTINGS_ID);
        }}
        collapsed={layout.mode === 'stacked' && layout.isCollapsed('dashboard')}
        toggleable={layout.mode === 'stacked'}
        onCollapsedChange={(next) => layout.setCollapsed('dashboard', next)}
      />
    </div>
  );
}

export function ChartInstancePane({ instance }: { instance: string }) {
  const layout = useLayout();
  const modal = useModal();
  const panel = instancePanelId('chart', instance);
  return (
    <div className="pane-dashboard">
      <DashboardPanel
        setting={chartSetting(panel)}
        title={layout.paneTitle(panel).label}
        toggleable={false}
        onOpenSettings={() => {
          setDashboardSettingsTarget(panel);
          modal.open(DASHBOARD_SETTINGS_ID);
        }}
      />
    </div>
  );
}

export function PropertiesInstancePane({ instance }: { instance: string }) {
  const layout = useLayout();
  const panel = instancePanelId('properties', instance);
  const [spec, setSpec] = usePersisted(propertiesSetting(panel));
  return (
    <div className="pane-properties">
      <PropertiesPanel
        title={layout.paneTitle(panel).label}
        scope={{
          value: spec.scope,
          onChange: (scope) => setSpec({ scope }),
        }}
      />
    </div>
  );
}

export function MeasurementsPane() {
  return (
    <div className="pane-measurements">
      <MeasurementsPanel />
    </div>
  );
}

export function ModelsPane() {
  const state = useOpenModels();
  const store = useOpenModelsStore();
  const tree = useTreeControl();
  const active = state.active;
  const entry = state.models.find((model) => model.urn === active) ?? null;
  const open = useCallback(
    (id: string) => {
      if (!store) return;
      const item = FEDERATIONS.get(id);
      if (!item) return;
      void (async () => {
        const { data, stale } = await resolveFederation(
          item.data,
          latestVersionUrn,
        );
        const plan = federationOpenPlan(data);
        const tints = withFederationTints(MODEL_TINTS.read(), data);
        if (
          JSON.stringify(tints.tints) !==
          JSON.stringify(MODEL_TINTS.read().tints)
        ) {
          MODEL_TINTS.write(tints);
        }
        const hidden = withFederationHidden(
          HIDDEN_MODELS.read(),
          data,
          MAX_HIDDEN_URNS,
        );
        if (JSON.stringify(hidden) !== JSON.stringify(HIDDEN_MODELS.read())) {
          HIDDEN_MODELS.write(hidden);
        }
        store.open(plan.urn, plan.context);
        store.setView(plan.urn, { offsets: plan.offsets ?? null });
        notify(
          stale.length > 0
            ? `Opened ${item.name} with the saved version of ${stale.join(', ')}.`
            : `Opened ${item.name}.`,
          { tone: stale.length > 0 ? 'warning' : 'success' },
        );
      })();
    },
    [store],
  );
  useEffect(() => setFederationOpener(open), [open]);
  const save = (name: string) => {
    if (!entry) return;
    const data = captureFederation(
      entry,
      (urn) => recallModel(urn) ?? {},
      MODEL_TINTS.read(),
      HIDDEN_MODELS.read(),
    );
    if (!data) {
      notify('Open two or more models to save a combination.', {
        tone: 'error',
      });
      return;
    }
    const saved = FEDERATIONS.save(name, data);
    if (saved) {
      notify(`Saved ${name}.`, { tone: 'success' });
    } else {
      notify(
        'Could not save the combination. Saved items hold up to 4 MB; delete some and try again.',
        { tone: 'error' },
      );
    }
  };
  return (
    <div className="pane-models">
      <ModelsPanel
        setKey={active}
        onRemove={
          store && active ? (urn) => store.removeFrom(active, urn) : undefined
        }
        onAdd={tree ? () => tree.reveal() : undefined}
        onSaveFederation={save}
        onOpenFederation={open}
      />
    </div>
  );
}
