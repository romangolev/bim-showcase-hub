import { useNavigate } from '@tanstack/react-router';
import { useContext } from 'react';
import type { ModelContext } from '../../api/modelContext.js';
import { modelTabTitle } from '../../api/modelTitles.js';
import { contextOf, modelUrnsOf } from '../../api/openModels.js';
import { useOpenModels, useOpenModelsStore } from '../../api/useOpenModels.js';
import { LayoutContext } from '../../layout/layoutContext.js';
import { PANE_SETTINGS } from '../../settings/paneSettings.js';
import { usePersisted } from '../../storage.js';
import { notify } from '../../tasks/notifications.js';
import {
  loadedMembers,
  type OpenMode,
  type OpenOutcome,
  type OpenPreview,
  type OpenReveal,
  openModels,
  previewOpen,
} from '../../viewer/openModels.js';
import type { AddTarget, PickedModel } from './DocumentTree.js';

const COMBINED_FULL_NOTICE = 'The open viewer is full; opened a new tab';

export interface OpenOptions {
  partial?: boolean;
}

export interface ModelOpeners {
  open: (urn: string, context: ModelContext) => void;
  openTabs: (models: PickedModel[], options?: OpenOptions) => OpenOutcome;
  openTogether: (models: PickedModel[], options?: OpenOptions) => OpenOutcome;
  preview: (
    models: readonly PickedModel[],
    mode: OpenMode,
    options?: OpenOptions,
  ) => OpenPreview;
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

  const reveal = (target: OpenReveal | null, notice?: string | null) => {
    if (notice) notify(notice);
    if (!target) return;
    void navigate({
      to: '/model/$urn',
      params: { urn: target.urn },
      search: target.context,
    });
    onNavigate?.();
  };

  const run = (
    models: readonly PickedModel[],
    mode: OpenMode,
    options?: OpenOptions,
  ) => {
    const outcome = openModels(store, { models, mode, ...options });
    reveal(outcome.reveal, outcome.notice);
    return outcome;
  };

  const preview = (
    models: readonly PickedModel[],
    mode: OpenMode,
    options?: OpenOptions,
  ) => previewOpen(state, { models, mode, ...options });

  let addTarget: AddTarget | null = null;
  if (active && store) {
    const members = modelUrnsOf(state, active);
    const context = contextOf(state, active) ?? {};
    addTarget = {
      label: `the open viewer (${modelTabTitle(active, context).label})`,
      has: (candidate) => members.includes(candidate),
      onRemove: (candidate) => store.removeFrom(active, candidate),
      canAdd: (candidate) =>
        !preview([{ urn: candidate, context: {} }], 'add-to-active').blocked,
      onAdd: (models) => {
        const outcome = openModels(store, { models, mode: 'add-to-active' });
        if (outcome.notice) notify(outcome.notice);
      },
    };
  }

  const open = (urn: string, context: ModelContext) => {
    const models = [{ urn, context }];
    const mode = view.openMode;
    if (mode === 'replace') {
      run(models, 'replace');
      return;
    }
    if (mode === 'combined') {
      const added = openModels(store, { models, mode: 'add-to-active' });
      if (added.opened.length > 0) {
        reveal(added.reveal);
        return;
      }
      const full = added.skipped.some(
        (entry) => entry.reason === 'combined-limit',
      );
      const tab = openModels(store, { models, mode: 'tabs' });
      reveal(tab.reveal, full ? COMBINED_FULL_NOTICE : tab.notice);
      return;
    }
    run(models, 'tabs');
  };

  const openModal = (urn: string, context: ModelContext) => {
    layout?.floatNext(urn);
    run([{ urn, context }], 'tabs');
  };

  return {
    open,
    openTabs: (models, options) => run(models, 'tabs', options),
    openTogether: (models, options) => run(models, 'together', options),
    preview,
    openModal,
    addTarget,
    loaded: loadedMembers(state),
  };
}
