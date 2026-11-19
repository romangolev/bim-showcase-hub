import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useContext } from 'react';
import {
  MAX_COMBINED_MODELS,
  MAX_LOADED_MEMBERS,
} from '../../shared/combined.js';
import { joinWith, type ModelContext } from '../api/modelContext.js';
import { rememberModel } from '../api/modelStore.js';
import { modelTabTitle } from '../api/modelTitles.js';
import {
  contextOf,
  modelUrnsOf,
  type OpenModelsState,
  type OpenModelsStore,
} from '../api/openModels.js';
import { useModelContext } from '../api/useModelContext.js';
import { useOpenModels, useOpenModelsStore } from '../api/useOpenModels.js';
import { LayoutContext } from '../layout/layoutContext.js';
import { PANE_SETTINGS, usePaneSetting } from '../settings/paneSettings.js';
import {
  type AddTarget,
  DocumentTree,
  type PickedModel,
} from './tree/DocumentTree.js';
import { RecentStrip } from './tree/RecentStrip.js';
import type { TreeOpenMode } from './tree/treeView.js';

export interface TreePanelProps {
  onNavigate?: () => void;
}

export function openPickedAsTabs(
  store: OpenModelsStore | null,
  models: readonly PickedModel[],
): PickedModel[] {
  const admitted = models.slice(0, MAX_LOADED_MEMBERS);
  for (const model of admitted) {
    rememberModel(model.urn, model.context);
    store?.open(model.urn, model.context);
  }
  return admitted;
}

export function openWithMode(
  mode: TreeOpenMode,
  store: OpenModelsStore | null,
  state: OpenModelsState,
  urn: string,
  context: ModelContext,
): { urn: string; context: ModelContext } {
  if (!store) return { urn, context };
  const active = state.active;
  if (mode === 'replace' && active && active !== urn) {
    store.open(urn, context);
    store.close(active);
    return { urn, context };
  }
  if (mode === 'combined' && active && active !== urn) {
    if (modelUrnsOf(state, active).length < MAX_COMBINED_MODELS) {
      rememberModel(urn, context);
      store.addTo(active, urn);
      return {
        urn: active,
        context: contextOf(store.getState(), active) ?? {},
      };
    }
  }
  store.open(urn, context);
  return { urn, context };
}

export function TreePanel({ onNavigate }: TreePanelProps) {
  const navigate = useNavigate();
  const { urn } = useParams({ strict: false }) as { urn?: string };
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { trail } = useModelContext(urn, search);
  const store = useOpenModelsStore();
  const state = useOpenModels();
  const active = state.active;
  const layout = useContext(LayoutContext);
  const [view] = usePaneSetting(PANE_SETTINGS.tree.view);

  const openTogether = (models: PickedModel[]) => {
    const [first, ...rest] = models.slice(0, MAX_COMBINED_MODELS);
    if (!first) return;
    for (const model of models) rememberModel(model.urn, model.context);
    const extra = joinWith(rest.map((model) => model.urn));
    void navigate({
      to: '/model/$urn',
      params: { urn: first.urn },
      search: extra ? { ...first.context, with: extra } : first.context,
    });
    onNavigate?.();
  };

  let addTarget: AddTarget | null = null;
  if (active && store) {
    const members = modelUrnsOf(state, active);
    const context = contextOf(state, active) ?? {};
    addTarget = {
      label: `the open viewer (${modelTabTitle(active, context).label})`,
      has: (candidate) => members.includes(candidate),
      onRemove: (candidate) => store.removeFrom(active, candidate),
      canAdd: (candidate) =>
        !members.includes(candidate) && members.length < MAX_COMBINED_MODELS,
      onAdd: (models) => {
        let count = members.length;
        for (const model of models) {
          if (count >= MAX_COMBINED_MODELS) break;
          if (members.includes(model.urn)) continue;
          rememberModel(model.urn, model.context);
          store.addTo(active, model.urn);
          count += 1;
        }
      },
    };
  }

  const open = (next: string, context: ModelContext) => {
    const target = openWithMode(view.openMode, store, state, next, context);
    void navigate({
      to: '/model/$urn',
      params: { urn: target.urn },
      search: target.context,
    });
    onNavigate?.();
  };

  const openTabs = (models: PickedModel[]) => {
    const admitted = openPickedAsTabs(store, models);
    const last = admitted[admitted.length - 1];
    if (!last) return;
    void navigate({
      to: '/model/$urn',
      params: { urn: last.urn },
      search: last.context,
    });
    onNavigate?.();
  };

  const openModal = (next: string, context: ModelContext) => {
    layout?.floatNext(next);
    open(next, context);
  };

  return (
    <aside id="document-panel" className="tree-panel" aria-label="Documents">
      <div className="tree-panel__head">
        <h2 className="tree-panel__title">Documents</h2>
      </div>
      <RecentStrip
        selectedUrn={urn}
        onOpen={open}
        onOpenModal={openModal}
        addTarget={addTarget}
      />
      <DocumentTree
        selectedUrn={urn}
        revealTrail={trail}
        onOpenModel={open}
        onOpenTabs={openTabs}
        onOpenModal={openModal}
        onOpenTogether={openTogether}
        addTarget={addTarget}
      />
    </aside>
  );
}
