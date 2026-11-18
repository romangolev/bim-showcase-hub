import { useState } from 'react';
import {
  type DashboardView,
  sanitizeDashboardView,
} from '../extensions/dashboardPresets.js';
import {
  MAX_NAME_LENGTH,
  readSaved,
  removeSaved,
  type SavedItem,
  upsertSaved,
} from '../store/savedStore.js';

export const DASHBOARD_PRESET_KIND = 'dashboard-preset';

function newId(): string {
  return `dp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listDashboardPresets(): SavedItem[] {
  return readSaved(DASHBOARD_PRESET_KIND);
}

export function saveDashboardPreset(name: string, view: DashboardView) {
  const item: SavedItem = {
    id: newId(),
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
  const [items, setItems] = useState(listDashboardPresets);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const refresh = () => setItems(listDashboardPresets());

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = saveDashboardPreset(trimmed, view);
    setFailed(!ok);
    if (ok) setName('');
    refresh();
  };

  const rename = (item: SavedItem, next: string) => {
    const trimmed = next.trim();
    if (trimmed && trimmed !== item.name) {
      upsertSaved({ ...item, name: trimmed, updatedAt: Date.now() });
    }
    refresh();
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
                onBlur={(e) => rename(item, e.target.value)}
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
                onClick={() => {
                  removeSaved(item.id);
                  refresh();
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
