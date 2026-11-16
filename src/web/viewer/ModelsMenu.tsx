import { Icon } from '../components/icons.js';
import { Menu, type MenuEntry } from '../components/Menu.js';
import { MAX_COMBINED_MODELS, type ModelInfo } from './modelSet.js';

export interface ModelsMenuProps {
  models: readonly ModelInfo[];
  onToggle: (id: string, visible: boolean) => void;
  onRemove: (id: string) => void;
  onAdd?: () => void;
}

function stateOf(model: ModelInfo): string {
  if (model.status === 'loading') return ' (loading)';
  if (model.status === 'error') return ' (failed)';
  return '';
}

export function modelsMenuEntries({
  models,
  onToggle,
  onRemove,
  onAdd,
}: ModelsMenuProps): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const model of models) {
    entries.push({
      id: `show:${model.id}`,
      label: `Show ${model.name}${stateOf(model)}`,
      checked: model.status === 'ready' ? model.visible : false,
      disabled: model.status !== 'ready',
      onSelect: () => onToggle(model.id, !model.visible),
    });
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
        triggerClassName="bsh-viewer-models__trigger"
        trigger={
          <>
            <Icon name="layers" size={14} />
            <span>{props.models.length} models</span>
          </>
        }
        items={() => modelsMenuEntries(props)}
      />
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
              <span className="bsh-viewer-models__error-text">
                {model.error}
              </span>
              <button
                type="button"
                className="bsh-viewer-models__remove"
                onClick={() => props.onRemove(model.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
