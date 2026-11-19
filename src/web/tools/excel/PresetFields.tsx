import { useState } from 'react';
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
    <fieldset className="bsh-fieldset">
      <legend>Presets</legend>
      <div className="bsh-presets">
        <input
          type="text"
          className="bsh-input"
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
          className="bsh-button"
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
      <ul className="settings__palette" aria-label="Built-in presets">
        {BUILT_IN_EXPORT_PRESETS.map((preset) => {
          const needsCatalog =
            preset.everyColumn === true && catalog.length === 0;
          return (
            <li key={preset.id} className="bsh-presets">
              <span>{preset.name}</span>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Apply ${preset.name}`}
                disabled={needsCatalog}
                onClick={() => apply(builtInSettings(preset, catalog))}
              >
                Apply
              </button>
            </li>
          );
        })}
      </ul>
      {catalog.length === 0 ? (
        <p className="settings__hint">
          Everything uses every column discovered in the open model. Open a
          model to enable it.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="settings__hint">No saved presets yet.</p>
      ) : (
        <ul className="settings__palette">
          {items.map((item) => (
            <li key={`${item.id}:${item.name}`} className="bsh-presets">
              <span>{item.name}</span>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Apply ${item.name}`}
                onClick={() => apply(presetSettings(item.data))}
              >
                Apply
              </button>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Delete ${item.name}`}
                onClick={() => {
                  EXPORT_PRESETS.remove(item.id);
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
