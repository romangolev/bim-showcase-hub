import { useState } from 'react';
import type { PropertyRow } from '../../shared/types.js';
import { availableProperties } from '../extensions/dashboardData.js';
import {
  DASHBOARD_PRESETS,
  type DashboardView,
  sanitizeDashboardView,
  viewProperties,
} from '../extensions/dashboardPresets.js';
import {
  MAX_NAME_LENGTH,
  removeSaved,
  type SavedItem,
  upsertSaved,
} from '../store/savedStore.js';
import {
  listDashboardPresets,
  saveDashboardPreset,
} from './DashboardUserPresets.js';

interface DashboardGalleryProps {
  view: DashboardView;
  apply: (view: DashboardView) => void;
  rows?: readonly PropertyRow[];
}

function Preview({ properties }: { properties: readonly string[] }) {
  return (
    <ul className="bsh-gallery__preview" aria-hidden="true">
      {properties.map((name) => (
        <li key={name}>
          <svg viewBox="0 0 36 20" width="36" height="20" focusable="false">
            <title>Chart preview</title>
            <rect x="2" y="10" width="5" height="8" rx="1" />
            <rect x="9" y="4" width="5" height="14" rx="1" />
            <rect x="16" y="8" width="5" height="10" rx="1" />
            <circle
              cx="29"
              cy="10"
              r="6"
              fill="none"
              strokeWidth="4"
              strokeDasharray="14 24"
            />
          </svg>
          <span>{name}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardGallery({ view, apply, rows }: DashboardGalleryProps) {
  const [items, setItems] = useState<SavedItem[]>(listDashboardPresets);
  const [failed, setFailed] = useState(false);
  const refresh = () => setItems(listDashboardPresets());

  const note = (properties: readonly string[]) =>
    `Charts ${properties.join(', ')}${
      rows &&
      rows.length > 0 &&
      availableProperties(rows, properties).length === 0
        ? '. Not in this model.'
        : ''
    }`;

  const rename = (item: SavedItem, next: string) => {
    const trimmed = next.trim();
    if (trimmed && trimmed !== item.name) {
      upsertSaved({ ...item, name: trimmed, updatedAt: Date.now() });
    }
    refresh();
  };

  return (
    <section className="bsh-gallery" aria-label="Dashboard preset gallery">
      {failed ? (
        <p role="alert" className="settings__hint">
          Could not save the preset. Delete some saved items and try again.
        </p>
      ) : null}
      <ul className="bsh-gallery__list" aria-label="Dashboard presets">
        {DASHBOARD_PRESETS.map((preset) => (
          <li key={preset.id} className="bsh-gallery__card">
            <h3 className="bsh-gallery__name">{preset.label}</h3>
            <span className="bsh-gallery__tag">Built-in</span>
            <Preview properties={preset.properties} />
            <p className="bsh-gallery__note">{note(preset.properties)}</p>
            <div className="bsh-gallery__actions">
              <button
                type="button"
                className="bsh-button bsh-gallery__primary"
                aria-label={`Apply ${preset.label}`}
                onClick={() => apply({ ...view, preset: preset.id })}
              >
                Apply
              </button>
              <button
                type="button"
                className="bsh-button"
                aria-label={`Save ${preset.label} as my preset`}
                onClick={() => {
                  setFailed(
                    !saveDashboardPreset(preset.label, {
                      ...view,
                      preset: preset.id,
                    }),
                  );
                  refresh();
                }}
              >
                Save as my preset
              </button>
            </div>
          </li>
        ))}
        {items.map((item) => {
          const own = sanitizeDashboardView(item.data);
          const properties = viewProperties(own);
          return (
            <li key={`${item.id}:${item.name}`} className="bsh-gallery__card">
              <input
                type="text"
                className="bsh-input bsh-gallery__name"
                aria-label={`Rename ${item.name}`}
                maxLength={MAX_NAME_LENGTH}
                defaultValue={item.name}
                onBlur={(e) => rename(item, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
              <span className="bsh-gallery__tag">Mine</span>
              <Preview properties={properties} />
              <p className="bsh-gallery__note">{note(properties)}</p>
              <div className="bsh-gallery__actions">
                <button
                  type="button"
                  className="bsh-button bsh-gallery__primary"
                  aria-label={`Apply ${item.name}`}
                  onClick={() => apply(own)}
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
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
