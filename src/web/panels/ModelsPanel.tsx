import { useId } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import { CostMeter } from '../viewer/CostMeter.js';
import { explainFailure } from '../viewer/failureExplainer.js';
import type { ModelInfo } from '../viewer/modelSet.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { isolatedModel, isolateVisibility } from './modelRows.js';
import { useResolvedAdapter } from './usePropertyRows.js';
import './panels.css';

export interface ModelsPanelProps {
  adapter?: ViewerAdapter | null;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
}

function statusLabel(model: ModelInfo): string {
  if (model.status === 'loading') return 'Loading';
  if (model.status === 'error') return 'Failed';
  return 'Ready';
}

export function ModelsPanel({ adapter, onRemove, onAdd }: ModelsPanelProps) {
  const titleId = useId();
  const resolved = useResolvedAdapter(adapter);
  const models = useModels(resolved);
  const isolated = isolatedModel(models);
  return (
    <section className="bsh-card bsh-models" aria-labelledby={titleId}>
      <header className="bsh-card__header">
        <h2 id={titleId} className="bsh-card__title">
          Models
        </h2>
        {onAdd ? (
          <button type="button" className="bsh-button" onClick={onAdd}>
            Add model
          </button>
        ) : null}
      </header>
      {resolved && models.length > 0 ? (
        <>
          <CostMeter adapter={resolved} models={models} />
          <ul className="bsh-models__list">
            {models.map((model) => {
              const failure =
                model.status === 'error' ? explainFailure(model.reason) : null;
              return (
                <li
                  key={model.id}
                  className="bsh-models__row"
                  data-status={model.status}
                >
                  <button
                    type="button"
                    className="bsh-icon-button"
                    aria-label={`${model.visible ? 'Hide' : 'Show'} ${model.name}`}
                    aria-pressed={model.visible}
                    disabled={model.status !== 'ready'}
                    onClick={() =>
                      resolved.setModelVisible(model.id, !model.visible)
                    }
                  >
                    <Icon name={model.visible ? 'layers' : 'ban'} size={14} />
                  </button>
                  <span className="bsh-models__main">
                    <span className="bsh-models__name" title={model.name}>
                      <span
                        className="bsh-models__dot"
                        data-status={model.status}
                        role="img"
                        aria-label={statusLabel(model)}
                      />
                      {model.name}
                    </span>
                    {failure ? (
                      <span className="bsh-error" title={model.error}>
                        {failure.title}. {failure.text}
                      </span>
                    ) : null}
                  </span>
                  {failure?.retry ? (
                    <button
                      type="button"
                      className="bsh-button"
                      aria-label={`Retry ${model.name}`}
                      onClick={() =>
                        void resolved
                          .addModel({ urn: model.urn, name: model.name })
                          .catch(() => {})
                      }
                    >
                      Retry
                    </button>
                  ) : null}
                  {model.status === 'ready' && models.length > 1 ? (
                    <button
                      type="button"
                      className="bsh-button"
                      aria-label={
                        isolated === model.id
                          ? 'Show all models'
                          : `Isolate ${model.name}`
                      }
                      aria-pressed={isolated === model.id}
                      onClick={() => {
                        for (const [id, visible] of Object.entries(
                          isolateVisibility(models, model.id),
                        )) {
                          resolved.setModelVisible(id, visible);
                        }
                      }}
                    >
                      {isolated === model.id ? 'Show all' : 'Isolate'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="bsh-button"
                    aria-label={`Remove ${model.name}`}
                    onClick={() =>
                      onRemove
                        ? onRemove(model.id)
                        : resolved.removeModel(model.id)
                    }
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <StateBlock
          variant="empty"
          message="Open a model to list its models here."
          compact
        />
      )}
    </section>
  );
}
