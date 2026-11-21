import { useState } from 'react';
import { ItemList, ItemRow } from '../../components/ItemList.js';
import { useSavedKindItems } from '../../store/savedKinds.js';
import { MAX_NAME_LENGTH } from '../../store/savedStore.js';
import {
  BUILT_IN_EXPORT_PRESETS,
  builtInSettings,
  EXPORT_PRESETS,
  type ExportPresetSettings,
  presetFromSettings,
  presetSettings,
} from './exportPresets.js';

interface PresetFieldsProps {
  current: ExportPresetSettings;
  apply: (settings: ExportPresetSettings) => void;
  catalog?: readonly string[];
}

export function PresetFields({
  current,
  apply,
  catalog = [],
}: PresetFieldsProps) {
  const items = useSavedKindItems(EXPORT_PRESETS);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = EXPORT_PRESETS.save(trimmed, presetFromSettings(current));
    setFailed(saved === null);
    if (saved) setName('');
  };

  return (
    <fieldset className="settings__section">
      <legend className="settings__heading">Presets</legend>
      <div className="settings__actions">
        <input
          type="text"
          aria-label="Export preset name"
          placeholder="Name this setup"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={!name.trim()}
          onClick={save}
        >
          Save current setup
        </button>
      </div>
      {failed ? (
        <p role="alert" className="settings__hint">
          Could not save the preset. Delete some saved items and try again.
        </p>
      ) : null}
      <ItemList label="Built-in presets">
        {BUILT_IN_EXPORT_PRESETS.map((preset) => {
          const needsCatalog =
            preset.everyColumn === true && catalog.length === 0;
          return (
            <ItemRow key={preset.id}>
              <span>{preset.name}</span>
              <button
                type="button"
                className="btn btn-small"
                aria-label={`Apply ${preset.name}`}
                disabled={needsCatalog}
                onClick={() => apply(builtInSettings(preset, catalog))}
              >
                Apply
              </button>
            </ItemRow>
          );
        })}
      </ItemList>
      {catalog.length === 0 ? (
        <p className="settings__hint">
          Everything uses every column discovered in the open model. Open a
          model to enable it.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="settings__hint">No saved presets yet.</p>
      ) : (
        <ItemList>
          {items.map((item) => (
            <ItemRow key={`${item.id}:${item.name}`}>
              <span>{item.name}</span>
              <button
                type="button"
                className="btn btn-small"
                aria-label={`Apply ${item.name}`}
                onClick={() => apply(presetSettings(item.data))}
              >
                Apply
              </button>
              <button
                type="button"
                className="btn btn-small"
                aria-label={`Delete ${item.name}`}
                onClick={() => {
                  EXPORT_PRESETS.remove(item.id);
                }}
              >
                Delete
              </button>
            </ItemRow>
          ))}
        </ItemList>
      )}
    </fieldset>
  );
}
