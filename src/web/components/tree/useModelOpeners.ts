import { useNavigate } from '@tanstack/react-router';
import { useContext } from 'react';
import { MAX_COMBINED_MODELS } from '../../../shared/combined.js';
import { joinWith, type ModelContext } from '../../api/modelContext.js';
import { rememberModel } from '../../api/modelStore.js';
import { modelTabTitle } from '../../api/modelTitles.js';
import { contextOf, modelUrnsOf } from '../../api/openModels.js';
import { useOpenModels, useOpenModelsStore } from '../../api/useOpenModels.js';
import { LayoutContext } from '../../layout/layoutContext.js';
import { PANE_SETTINGS } from '../../settings/paneSettings.js';
import { usePersisted } from '../../storage.js';
import { notify } from '../../tasks/notifications.js';
import type { AddTarget, PickedModel } from './DocumentTree.js';
import {
  canJoinTab,
  exceedsTabLimit,
  loadedMembers,
  type OpenTarget,
  openAsTab,
  openPickedAsTabs,
  openWithMode,
} from './openHelpers.js';
import { tabLimitMessage } from './treeState.js';

export interface ModelOpeners {
  open: (urn: string, context: ModelContext) => void;
  openTabs: (models: PickedModel[]) => void;
  openTogether: (models: PickedModel[]) => void;
  openModal: (urn: string, context: ModelContext) => void;
  addTarget: AddTarget | null;
  loaded: number;
}

export function useModelOpeners(onNavigate?: () => void): ModelOpeners {
  const navigate = useNavigate();
  const store = useOpenModelsStore();
  const state = useOpenModels();
  const active = state.active;
  const layout = useContext(LayoutContext);
  const [view] = usePersisted(PANE_SETTINGS.tree.view);

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
      canAdd: (candidate) => canJoinTab(state, active, candidate),
      onAdd: (models) => {
        let count = members.length;
        for (const model of models) {
          if (count >= MAX_COMBINED_MODELS) break;
          if (!canJoinTab(state, active, model.urn)) continue;
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

  const open = (urn: string, context: ModelContext) => {
    reveal(openWithMode(view.openMode, store, state, urn, context));
  };

  const openTabs = (models: PickedModel[]) => {
    if (exceedsTabLimit(state, models)) {
      notify(tabLimitMessage(loadedMembers(state)));
      return;
    }
    const last = openPickedAsTabs(store, models).at(-1);
    if (last) reveal(last);
  };

  const openModal = (urn: string, context: ModelContext) => {
    layout?.floatNext(urn);
    reveal(openAsTab(store, urn, context));
  };

  return {
    open,
    openTabs,
    openTogether,
    openModal,
    addTarget,
    loaded: loadedMembers(state),
  };
}
