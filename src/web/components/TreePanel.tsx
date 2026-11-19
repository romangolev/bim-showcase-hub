import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useContext } from 'react';
import { MAX_COMBINED_MODELS } from '../../shared/combined.js';
import { joinWith, type ModelContext } from '../api/modelContext.js';
import { rememberModel } from '../api/modelStore.js';
import { modelTabTitle } from '../api/modelTitles.js';
import { contextOf, modelUrnsOf } from '../api/openModels.js';
import { useModelContext } from '../api/useModelContext.js';
import { useOpenModels, useOpenModelsStore } from '../api/useOpenModels.js';
import { LayoutContext } from '../layout/layoutContext.js';
import {
  type AddTarget,
  DocumentTree,
  type PickedModel,
} from './tree/DocumentTree.js';
import { RecentStrip } from './tree/RecentStrip.js';

export interface TreePanelProps {
  onNavigate?: () => void;
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
    void navigate({
      to: '/model/$urn',
      params: { urn: next },
      search: context,
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
        onOpenModal={openModal}
        onOpenTogether={openTogether}
        addTarget={addTarget}
      />
    </aside>
  );
}
