import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../components/icons.js';
import { StateBlock } from '../components/StateBlock.js';
import { usePersisted } from '../storage.js';
import { CostMeter } from '../viewer/CostMeter.js';
import { colorLayersFor } from '../viewer/colorLayers.js';
import { explainFailure } from '../viewer/failureExplainer.js';
import type { ModelInfo, Vec3 } from '../viewer/modelSet.js';
import { useModels } from '../viewer/useModels.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ModelAlignment } from './ModelAlignment.js';
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
import { QuickSettings, useQuickSettings } from './QuickSettings.js';
import { useResolvedAdapter } from './useScopedRows.js';
import './panels.css';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { ToggleButton } from '../ui/ToggleButton.js';

export interface ModelsPanelProps {
  adapter?: ViewerAdapter | null;
  onRemove?: (id: string) => void;
  onAdd?: () => void;
  setKey?: string | null;
  onOpenSettings?: () => void;
  offsets?: Readonly<Record<string, Vec3>> | null;
  onOffsetsChange?: (next: Record<string, Vec3> | null) => void;
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
  onOpenSettings,
  offsets,
  onOffsetsChange,
}: ModelsPanelProps) {
  const titleId = useId();
  const resolved = useResolvedAdapter(adapter);
  const models = useModels(resolved);
  const isolated = isolatedModel(models);
  const [tints, setTints] = usePersisted(MODEL_TINTS);
  const sectionRef = useRef<HTMLElement>(null);
  const [controls, setControls] = useState<boolean>();
  const quick = useQuickSettings(sectionRef, controls, setControls);
  useModelTints(resolved, models, tints);
  const palette = tintPaletteFor(tints, setKey);
  const ready = models.filter((model) => model.status === 'ready');
  const placement = resolved ? resolved.getPlacementInfo() : [];
  const placementOf = new Map(placement.map((entry) => [entry.modelId, entry]));
  const anchorName =
    models.find((model) => placementOf.get(model.id)?.anchor)?.name ?? null;
  const anchorUnit = placement.find((entry) => entry.anchor)?.unit ?? null;
  const showAlignment = Boolean(
    resolved && onOffsetsChange && ready.length > 1,
  );
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
  return (
    <section
      ref={sectionRef}
      className="bsh-card bsh-models"
      aria-labelledby={titleId}
      data-compact={!(resolved && models.length > 0 && quick.open)}
    >
      <header className="bsh-card__header bsh-models__header">
        <h2 id={titleId} className="bsh-card__title">
          Models
        </h2>
        {onAdd ? (
          <Button size="small" onClick={onAdd}>
            <Icon name="plus" size={14} />
            Add model
          </Button>
        ) : null}
        {resolved && models.length > 0 ? (
          <QuickSettings
            label="Models controls"
            open={quick.open}
            onToggle={quick.toggle}
          >
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
              <Button size="small" onClick={resetTints}>
                Reset tints
              </Button>
            ) : null}
            {onOpenSettings ? (
              <IconButton
                label="Models settings"
                className="bsh-models__settings"
                onClick={onOpenSettings}
              >
                <Icon name="settings" size={16} />
              </IconButton>
            ) : null}
            {showAlignment ? (
              <section
                className="bsh-models__alignment-list"
                aria-label="Model alignment"
              >
                <h3 className="bsh-models__subtitle">Alignment</h3>
                <ul className="bsh-models__list">
                  {ready.map((model) => (
                    <li key={model.id}>
                      <ModelAlignment
                        adapter={resolved}
                        model={model}
                        info={placementOf.get(model.id) ?? null}
                        anchorName={anchorName}
                        anchorUnit={anchorUnit}
                        offsets={offsets}
                        onOffsetsChange={onOffsetsChange}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </QuickSettings>
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
                  className="bsh-models__row bsh-models__row--model"
                  data-status={model.status}
                >
                  <IconButton
                    label={`${model.visible ? 'Hide' : 'Show'} ${model.name}`}
                    aria-pressed={model.visible}
                    disabled={model.status !== 'ready'}
                    onClick={() =>
                      resolved.setModelVisible(model.id, !model.visible)
                    }
                  >
                    <Icon name={model.visible ? 'layers' : 'ban'} size={14} />
                  </IconButton>
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
                    {failure?.retry ||
                    (model.status === 'ready' && models.length > 1) ? (
                      <span className="bsh-models__more">
                        {failure?.retry ? (
                          <Button
                            size="small"
                            aria-label={`Retry ${model.name}`}
                            onClick={() =>
                              void resolved
                                .addModel({ urn: model.urn, name: model.name })
                                .catch(() => {})
                            }
                          >
                            Retry
                          </Button>
                        ) : null}
                        {model.status === 'ready' && models.length > 1 ? (
                          <ToggleButton
                            size="small"
                            aria-label={
                              isolated === model.id
                                ? 'Show all models'
                                : `Isolate ${model.name}`
                            }
                            pressed={isolated === model.id}
                            onClick={() => {
                              for (const [id, visible] of Object.entries(
                                isolateVisibility(models, model.id),
                              )) {
                                resolved.setModelVisible(id, visible);
                              }
                            }}
                          >
                            {isolated === model.id ? 'Show all' : 'Isolate'}
                          </ToggleButton>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                  <span className="bsh-models__actions">
                    <Button
                      size="small"
                      aria-label={`Remove ${model.name}`}
                      onClick={() => {
                        colorLayersFor(resolved).forgetModel(model.id);
                        if (onRemove) onRemove(model.id);
                        else resolved.removeModel(model.id);
                      }}
                    >
                      Remove
                    </Button>
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
    </section>
  );
}
