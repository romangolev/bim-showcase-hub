import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useContext, useState } from 'react';
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
import { notify } from '../tasks/notifications.js';
import { DocumentsHome } from './tree/DocumentsHome.js';
import {
  type AddTarget,
  DocumentTree,
  type PickedModel,
} from './tree/DocumentTree.js';
import { DEFAULT_TREE_ROOT, type TreeRoot } from './tree/docRoot.js';
import { HubProjectSwitcher } from './tree/HubProjectSwitcher.js';
import { RecentStrip } from './tree/RecentStrip.js';
import type { TreeOpenMode } from './tree/treeView.js';

export interface TreePanelProps {
  onNavigate?: () => void;
}

export interface OpenTarget {
  urn: string;
  context: ModelContext;
  notice?: string;
}

export const COMBINED_FULL_NOTICE = 'The open viewer is full; opened a new tab';

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

export function openAsTab(
  store: OpenModelsStore | null,
  urn: string,
  context: ModelContext,
): OpenTarget {
  openPickedAsTabs(store, [{ urn, context }]);
  return { urn, context };
}

export function openWithMode(
  mode: TreeOpenMode,
  store: OpenModelsStore | null,
  state: OpenModelsState,
  urn: string,
  context: ModelContext,
): OpenTarget {
  if (!store) return { urn, context };
  const active = state.active;
  if (mode === 'replace' && active && active !== urn) {
    const dropped = modelUrnsOf(state, active);
    store.open(urn, context);
    store.close(active);
    return {
      urn,
      context,
      notice:
        dropped.length > 1
          ? `Closed the combined tab and its ${dropped.length} models`
          : undefined,
    };
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
    store.open(urn, context);
    return { urn, context, notice: COMBINED_FULL_NOTICE };
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
  const [root, setRoot] = useState<TreeRoot>(DEFAULT_TREE_ROOT);
  const home = active === null;

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

  const reveal = (target: OpenTarget) => {
    if (target.notice) notify(target.notice);
    void navigate({
      to: '/model/$urn',
      params: { urn: target.urn },
      search: target.context,
    });
    onNavigate?.();
  };

  const open = (next: string, context: ModelContext) => {
    reveal(openWithMode(view.openMode, store, state, next, context));
  };

  const openTabs = (models: PickedModel[]) => {
    const last = openPickedAsTabs(store, models).at(-1);
    if (last) reveal(last);
  };

  const openModal = (next: string, context: ModelContext) => {
    layout?.floatNext(next);
    reveal(openAsTab(store, next, context));
  };

  return (
    <aside id="document-panel" className="tree-panel" aria-label="Documents">
      <div className="tree-panel__head">
        <h2 className="tree-panel__title">Documents</h2>
      </div>
      <div className="docs-toolbar">
        <HubProjectSwitcher onChange={setRoot} />
      </div>
      {home ? (
        <DocumentsHome
          selectedUrn={urn}
          onOpen={open}
          onOpenModal={openModal}
          onOpenTabs={openTabs}
          addTarget={addTarget}
        />
      ) : (
        <RecentStrip
          selectedUrn={urn}
          onOpen={open}
          onOpenModal={openModal}
          addTarget={addTarget}
        />
      )}
      <DocumentTree
        key={`${root.scope.kind}:${root.node.id}`}
        root={root}
        selectedUrn={urn}
        revealTrail={trail}
        openCount={state.models.length}
        onOpenModel={open}
        onOpenTabs={openTabs}
        onOpenModal={openModal}
        onOpenTogether={openTogether}
        addTarget={addTarget}
      />
    </aside>
  );
}
