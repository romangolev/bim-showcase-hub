import { useState } from 'react';
import {
  DASHBOARD_USER_PRESETS,
  type DashboardView,
  sanitizeDashboardView,
  saveDashboardPreset,
} from '../extensions/dashboardPresets.js';
import { useSavedKindItems } from '../store/savedKinds.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { notify } from '../tasks/notifications.js';

interface DashboardUserPresetsProps {
  view: DashboardView;
  apply: (view: DashboardView) => void;
}

export function DashboardUserPresets({
  view,
  apply,
}: DashboardUserPresetsProps) {
  const items = useSavedKindItems(DASHBOARD_USER_PRESETS);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  const [renameFailed, setRenameFailed] = useState(false);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = saveDashboardPreset(trimmed, view);
    setFailed(!ok);
    if (ok) setName('');
  };

  return (
    <fieldset className="settings__section">
      <legend className="settings__heading">My presets</legend>
      <div className="settings__actions">
        <input
          type="text"
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
          className="btn"
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
      {renameFailed ? (
        <p role="alert" className="settings__hint">
          Could not rename the preset. Use a non-empty name.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="settings__hint">No saved presets yet.</p>
      ) : (
        <ul className="settings__override-list">
          {items.map((item) => (
            <li key={`${item.id}:${item.name}`} className="settings__override">
              <input
                type="text"
                aria-label={`Rename ${item.name}`}
                maxLength={MAX_NAME_LENGTH}
                defaultValue={item.name}
                onBlur={(e) => {
                  const ok = DASHBOARD_USER_PRESETS.rename(
                    item.id,
                    e.target.value,
                  );
                  if (!ok) e.target.value = item.name;
                  setRenameFailed(!ok);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <button
                type="button"
                className="btn"
                aria-label={`Apply ${item.name}`}
                onClick={() => apply(sanitizeDashboardView(item.data))}
              >
                Apply
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`Delete ${item.name}`}
                onClick={() => {
                  if (!DASHBOARD_USER_PRESETS.remove(item.id)) {
                    notify('Could not delete the preset.', { tone: 'error' });
                  }
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
