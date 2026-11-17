import { MAX_COMBINED_MODELS } from '../../shared/combined.js';
import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { CostMeter } from './CostMeter.js';
import { explainFailure } from './failureExplainer.js';
import {
  farApartMessage,
  type ModelInfo,
  type ModelSpread,
} from './modelSet.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

export const BRING_TOGETHER_LABEL = 'Bring models together (view only)';
export const RESTORE_POSITIONS_LABEL = 'Restore positions';
export const VIEW_ONLY_NOTE =
  'Moving models together changes this view only. The files and their coordinates stay as they are.';

export interface ModelsMenuProps {
  adapter?: ViewerAdapter | null;
  models: readonly ModelInfo[];
  onToggle: (id: string, visible: boolean) => void;
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  onAdd?: () => void;
  spread?: ModelSpread | null;
  together?: boolean;
  onBringTogether?: () => void;
  onRestorePositions?: () => void;
}

function stateOf(model: ModelInfo): string {
  if (model.status === 'loading') return ' (loading)';
  if (model.status === 'error') return ' (failed)';
  return '';
}

function failureText(model: ModelInfo): string {
  if (!model.reason || model.reason === 'unknown') return model.error ?? '';
  const { title, text } = explainFailure(model.reason);
  return `${title}. ${text}`;
}

export function modelsMenuEntries({
  models,
  onToggle,
  onRemove,
  onRetry,
  onAdd,
  spread,
  together,
  onBringTogether,
  onRestorePositions,
}: ModelsMenuProps): MenuEntry[] {
  const entries: MenuEntry[] = [];
  if (together && onRestorePositions) {
    entries.push({
      id: 'restore-positions',
      label: RESTORE_POSITIONS_LABEL,
      onSelect: onRestorePositions,
    });
    entries.push({ kind: 'separator', id: 'positions-separator' });
  } else if (spread?.farApart && onBringTogether) {
    entries.push({
      id: 'bring-together',
      label: BRING_TOGETHER_LABEL,
      onSelect: onBringTogether,
    });
    entries.push({ kind: 'separator', id: 'positions-separator' });
  }
  for (const model of models) {
    entries.push({
      id: `show:${model.id}`,
      label: `Show ${model.name}${stateOf(model)}`,
      checked: model.status === 'ready' ? model.visible : false,
      disabled: model.status !== 'ready',
      onSelect: () => onToggle(model.id, !model.visible),
    });
  }
  const failed = models.filter(
    (model) => model.status === 'error' && explainFailure(model.reason).retry,
  );
  if (onRetry && failed.length > 0) {
    entries.push({ kind: 'separator', id: 'retry-separator' });
    for (const model of failed) {
      entries.push({
        id: `retry:${model.id}`,
        label: `Retry ${model.name}`,
        onSelect: () => onRetry(model.id),
      });
    }
  }
  entries.push({ kind: 'separator', id: 'remove-separator' });
  for (const model of models) {
    entries.push({
      id: `remove:${model.id}`,
      label: `Remove ${model.name}`,
      icon: 'close',
      onSelect: () => onRemove(model.id),
    });
  }
  if (onAdd) {
    const full = models.length >= MAX_COMBINED_MODELS;
    entries.push({ kind: 'separator', id: 'add-separator' });
    entries.push({
      id: 'add',
      label: full
        ? `Add model... (limit of ${MAX_COMBINED_MODELS} reached)`
        : 'Add model...',
      disabled: full,
      onSelect: onAdd,
    });
  }
  return entries;
}

export function ModelsMenu(props: ModelsMenuProps) {
  const failed = props.models.filter((model) => model.status === 'error');
  const label = `Models in this viewer (${props.models.length})`;
  return (
    <div className="bsh-viewer-models">
      <Menu
        label={label}
        title={label}
        align="start"
        triggerClassName="bsh-viewer-models__trigger"
        trigger={
          <>
            <Icon name="layers" size={14} />
            <span>
              {props.models.length} of {MAX_COMBINED_MODELS} models
            </span>
          </>
        }
        items={() => modelsMenuEntries(props)}
      />
      <CostMeter adapter={props.adapter ?? null} models={props.models} />
      {props.spread?.farApart ? (
        <div className="bsh-viewer-models__far" role="status">
          <p className="bsh-viewer-models__far-text">
            {farApartMessage(props.spread)}
          </p>
          <p className="bsh-viewer-models__far-note">{VIEW_ONLY_NOTE}</p>
          {props.together && props.onRestorePositions ? (
            <button
              type="button"
              className="bsh-viewer-models__far-action"
              onClick={props.onRestorePositions}
            >
              {RESTORE_POSITIONS_LABEL}
            </button>
          ) : props.onBringTogether ? (
            <button
              type="button"
              className="bsh-viewer-models__far-action"
              onClick={props.onBringTogether}
            >
              {BRING_TOGETHER_LABEL}
            </button>
          ) : null}
        </div>
      ) : null}
      {failed.length > 0 ? (
        <ul
          className="bsh-viewer-models__errors"
          aria-label="Models that failed"
        >
          {failed.map((model) => (
            <li key={model.id} className="bsh-viewer-models__error">
              <span className="bsh-viewer-models__error-name">
                {model.name}
              </span>
              <span
                className="bsh-viewer-models__error-text"
                title={model.error}
              >
                {failureText(model)}
              </span>
              <span className="bsh-viewer-models__error-actions">
                {props.onRetry && explainFailure(model.reason).retry ? (
                  <button
                    type="button"
                    className="bsh-viewer-models__remove"
                    aria-label={`Retry ${model.name}`}
                    onClick={() => props.onRetry?.(model.id)}
                  >
                    Retry
                  </button>
                ) : null}
                <button
                  type="button"
                  className="bsh-viewer-models__remove"
                  onClick={() => props.onRemove(model.id)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
