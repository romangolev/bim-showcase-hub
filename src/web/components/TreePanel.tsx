import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { MAX_COMBINED_MODELS } from '../../shared/combined.js';
import { joinWith } from '../api/modelContext.js';
import { rememberModel } from '../api/modelStore.js';
import { contextOf, modelUrnsOf } from '../api/openModels.js';
import { useModelContext } from '../api/useModelContext.js';
import { useOpenModels, useOpenModelsStore } from '../api/useOpenModels.js';
import { modelTabTitle } from '../routes/ModelPage.js';
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

  return (
    <aside id="document-panel" className="tree-panel" aria-label="Documents">
      <div className="tree-panel__head">
        <h2 className="tree-panel__title">Documents</h2>
      </div>
      <RecentStrip
        selectedUrn={urn}
        onOpen={(next, context) => {
          void navigate({
            to: '/model/$urn',
            params: { urn: next },
            search: context,
          });
          onNavigate?.();
        }}
      />
      <DocumentTree
        selectedUrn={urn}
        revealTrail={trail}
        onOpenModel={(next, context) => {
          void navigate({
            to: '/model/$urn',
            params: { urn: next },
            search: context,
          });
          onNavigate?.();
        }}
        onOpenTogether={openTogether}
        addTarget={addTarget}
      />
    </aside>
  );
}
