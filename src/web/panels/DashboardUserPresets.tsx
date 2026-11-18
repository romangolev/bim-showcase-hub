import { useState } from 'react';
import {
  type DashboardView,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import {
  MAX_NAME_LENGTH,
  newSavedId,
  readSaved,
  removeSaved,
  renameSaved,
  type SavedItem,
  upsertSaved,
  useSavedItems,
} from '../store/savedStore.js';

export const DASHBOARD_PRESET_KIND = 'dashboard-preset';

export function listDashboardPresets(): SavedItem[] {
  return readSaved(DASHBOARD_PRESET_KIND);
}

export function saveDashboardPreset(name: string, view: DashboardView) {
  const item: SavedItem = {
    id: newSavedId('dp'),
    kind: DASHBOARD_PRESET_KIND,
    name,
    version: 1,
    updatedAt: Date.now(),
    data: { ...sanitizeDashboardView(view) },
  };
  return upsertSaved(item);
}

interface DashboardUserPresetsProps {
  view: DashboardView;
  apply: (view: DashboardView) => void;
}

export function DashboardUserPresets({
  view,
  apply,
}: DashboardUserPresetsProps) {
  const items = useSavedItems(DASHBOARD_PRESET_KIND);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = saveDashboardPreset(trimmed, view);
    setFailed(!ok);
    if (ok) setName('');
  };

  return (
    <fieldset className="bsh-fieldset">
      <legend>My presets</legend>
      <div className="bsh-presets">
        <input
          type="text"
          className="bsh-input"
          aria-label="Preset name"
          placeholder="Name the current board"
          maxLength={MAX_NAME_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <button
          type="button"
          className="bsh-button"
          disabled={!name.trim()}
          onClick={save}
        >
          Save current board
        </button>
      </div>
      {failed ? (
        <p role="alert" className="settings__hint">
          Could not save the preset. Delete some saved items and try again.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="settings__hint">No saved presets yet.</p>
      ) : (
        <ul className="settings__palette">
          {items.map((item) => (
            <li key={`${item.id}:${item.name}`} className="bsh-presets">
              <input
                type="text"
                className="bsh-input"
                aria-label={`Rename ${item.name}`}
                maxLength={MAX_NAME_LENGTH}
                defaultValue={item.name}
                onBlur={(e) =>
                  renameSaved(DASHBOARD_PRESET_KIND, item.id, e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <button
                type="button"
                className="bsh-button"
                aria-label={`Apply ${item.name}`}
                onClick={() => apply(sanitizeDashboardView(item.data))}
              >
                Apply
              </button>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Delete ${item.name}`}
                onClick={() => removeSaved(item.id)}
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
