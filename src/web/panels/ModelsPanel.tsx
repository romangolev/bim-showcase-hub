import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import { usePersisted } from '../storage.js';
import { useSavedKindItems } from '../store/savedKinds.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { CostMeter } from '../viewer/CostMeter.js';
import { colorLayersFor } from '../viewer/colorLayers.js';
import { explainFailure } from '../viewer/failureExplainer.js';
import type { ModelInfo } from '../viewer/modelSet.js';
import {
  FEDERATIONS,
  nextCombinationName,
} from '../viewer/savedFederations.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ModelTintSwatch } from './ModelTintSwatch.js';
import { isolatedModel, isolateVisibility } from './modelRows.js';
import {
  applyGhostOthers,
  applyModelTint,
  clampTintStrength,
  clearModelTint,
  MODEL_TINTS,
  type ModelTintState,
  resetGhostOthers,
  tintFor,
  tintPaletteFor,
  withGhostOthers,
  withModelTint,
  withoutTintPalette,
  withTintPalette,
} from './modelTint.js';
import { useResolvedAdapter } from './useScopedRows.js';
import './panels.css';

export interface ModelsPanelProps {
  adapter?: ViewerAdapter | null;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  setKey?: string | null;
  onSaveFederation?: (name: string) => void;
  onOpenFederation?: (id: string) => void;
}

function statusLabel(model: ModelInfo): string {
  if (model.status === 'loading') return 'Loading';
  if (model.status === 'error') return 'Failed';
  return 'Ready';
}

function tintKey(tint: { color: string; strength: number } | null): string {
  return tint ? `${tint.color}:${tint.strength}` : '';
}

function useModelTints(
  adapter: ViewerAdapter | null,
  models: readonly ModelInfo[],
  tints: ModelTintState,
): void {
  const applied = useRef(new Map<string, string>());
  useEffect(() => {
    if (!adapter) return;
    const layers = colorLayersFor(adapter);
    const present = new Set(models.map((model) => model.id));
    for (const [modelId] of applied.current) {
      if (!present.has(modelId)) applied.current.delete(modelId);
    }
    for (const model of models) {
      if (model.status !== 'ready') continue;
      const tint = tintFor(tints, model.id);
      const wanted = tintKey(tint);
      if (wanted === (applied.current.get(model.id) ?? '')) {
        if (!tint || layers.hasModel('modelTint', model.id)) continue;
      }
      if (!tint) {
        applied.current.delete(model.id);
        clearModelTint(adapter, model.id);
        continue;
      }
      applied.current.set(model.id, wanted);
      void applyModelTint(adapter, model.id, tint).catch(() => {});
    }
  }, [adapter, models, tints]);
}

export function ModelsPanel({
  adapter,
  onRemove,
  onAdd,
  setKey,
  onSaveFederation,
  onOpenFederation,
}: ModelsPanelProps) {
  const titleId = useId();
  const resolved = useResolvedAdapter(adapter);
  const models = useModels(resolved);
  const isolated = isolatedModel(models);
  const [tints, setTints] = usePersisted(MODEL_TINTS);
  const combinations = useSavedKindItems(FEDERATIONS);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  useModelTints(resolved, models, tints);
  const palette = tintPaletteFor(tints, setKey);
  const ready = models.filter((model) => model.status === 'ready');
  const tinted = models.filter((model) => tintFor(tints, model.id));
  const ghostTarget =
    isolated ??
    models.find((model) => model.status === 'ready' && model.visible)?.id ??
    null;
  useEffect(() => {
    if (!resolved || !tints.ghostOthers || !ghostTarget || ready.length < 2) {
      return;
    }
    void applyGhostOthers(resolved, ghostTarget).catch(() => {});
  }, [resolved, tints.ghostOthers, ghostTarget, ready.length]);
  const toggleGhost = () => {
    const next = !tints.ghostOthers;
    if (!next && resolved) resetGhostOthers(resolved);
    setTints((current) => withGhostOthers(current, next));
  };
  const resetTints = () => {
    if (!resolved) return;
    for (const model of tinted) clearModelTint(resolved, model.id);
    setTints((current) =>
      tinted.reduce(
        (state, model) => withModelTint(state, model.id, null),
        current,
      ),
    );
  };
  const updateStrength = (model: ModelInfo, strength: number) => {
    const value = clampTintStrength(strength);
    setTints((current) => {
      const tint = tintFor(current, model.id);
      return tint
        ? withModelTint(current, model.id, { ...tint, strength: value })
        : { ...current, strength: value };
    });
  };
  const canSave = Boolean(onSaveFederation) && ready.length > 1;
  const startNaming = () => {
    setName(nextCombinationName());
    setNaming(true);
  };
  const cancelNaming = () => {
    setNaming(false);
    setName('');
  };
  const saveCombination = () => {
    const clean = name.trim() || nextCombinationName();
    onSaveFederation?.(clean);
    setNaming(false);
    setName('');
  };
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
          {ready.length > 1 || tinted.length > 0 ? (
            <div className="bsh-models__tools">
              {ready.length > 1 ? (
                <label className="bsh-models__ghost">
                  <input
                    type="checkbox"
                    checked={tints.ghostOthers}
                    onChange={toggleGhost}
                  />
                  Ghost others
                </label>
              ) : null}
              {tinted.length > 0 ? (
                <button
                  type="button"
                  className="bsh-button"
                  onClick={resetTints}
                >
                  Reset tints
                </button>
              ) : null}
            </div>
          ) : null}
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
                    <span className="bsh-models__name">
                      <span
                        className="bsh-models__dot"
                        data-status={model.status}
                        role="img"
                        aria-label={statusLabel(model)}
                      />
                      {model.status === 'ready' ? (
                        <ModelTintSwatch
                          modelName={model.name}
                          palette={palette}
                          tint={tintFor(tints, model.id)}
                          strength={tints.strength}
                          onPick={(hex) =>
                            setTints((current) =>
                              withModelTint(current, model.id, {
                                color: hex,
                                strength:
                                  tintFor(current, model.id)?.strength ??
                                  current.strength,
                              }),
                            )
                          }
                          onStrength={(strength) =>
                            updateStrength(model, strength)
                          }
                          onClear={() =>
                            setTints((current) =>
                              withModelTint(current, model.id, null),
                            )
                          }
                          onPaletteColor={(index, hex) => {
                            const next = [...palette];
                            next[index] = hex;
                            setTints((current) =>
                              withTintPalette(current, setKey, next),
                            );
                          }}
                          onResetPalette={() =>
                            setTints((current) =>
                              withoutTintPalette(current, setKey),
                            )
                          }
                        />
                      ) : null}
                      <span className="bsh-models__label">{model.name}</span>
                    </span>
                    {failure ? (
                      <span className="bsh-error" title={model.error}>
                        {failure.title}. {failure.text}
                      </span>
                    ) : null}
                  </span>
                  <span className="bsh-models__actions">
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
                      onClick={() => {
                        colorLayersFor(resolved).forgetModel(model.id);
                        if (onRemove) onRemove(model.id);
                        else resolved.removeModel(model.id);
                      }}
                    >
                      Remove
                    </button>
                  </span>
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
      {canSave || combinations.length > 0 ? (
        <section
          className="bsh-models__combinations"
          aria-label="Saved combinations"
        >
          <div className="bsh-models__tools">
            <h3 className="bsh-models__subtitle">Saved combinations</h3>
            {canSave ? (
              <button
                type="button"
                className="bsh-button"
                onClick={startNaming}
              >
                Save combination…
              </button>
            ) : null}
          </div>
          {naming ? (
            <div className="bsh-presets">
              <input
                type="text"
                className="bsh-input"
                aria-label="Combination name"
                maxLength={MAX_NAME_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveCombination();
                  if (event.key === 'Escape') cancelNaming();
                }}
              />
              <button
                type="button"
                className="bsh-button"
                onClick={saveCombination}
              >
                Save combination
              </button>
              <button
                type="button"
                className="bsh-button"
                onClick={cancelNaming}
              >
                Cancel
              </button>
            </div>
          ) : null}
          {combinations.length === 0 ? (
            <p className="settings__hint">No saved combinations yet.</p>
          ) : (
            <ul className="settings__palette">
              {combinations.map((item) => (
                <li key={`${item.id}:${item.name}`} className="bsh-presets">
                  <input
                    type="text"
                    className="bsh-input"
                    aria-label={`Rename ${item.name}`}
                    maxLength={MAX_NAME_LENGTH}
                    defaultValue={item.name}
                    onBlur={(event) =>
                      FEDERATIONS.rename(item.id, event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                  <button
                    type="button"
                    className="bsh-button"
                    aria-label={`Open ${item.name}`}
                    disabled={!onOpenFederation}
                    onClick={() => onOpenFederation?.(item.id)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="bsh-button"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => FEDERATIONS.remove(item.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </section>
  );
}
