import { useId } from 'react';
import { NumberField } from '../components/NumberField.js';
import { SwitchRow } from '../components/SwitchRow.js';
import { useT } from '../i18n/i18n.js';
import { usePersisted } from '../storage.js';
import {
  MAX_ADVANCE_SECONDS,
  MAX_SIDE,
  MIN_CUSTOM_WIDTH,
  SNAPSHOT,
  type SnapshotResolution,
} from '../viewer/snapshot.js';

const RESOLUTIONS: readonly { id: SnapshotResolution; label: string }[] = [
  { id: '1x', label: 'Pane size (1x)' },
  { id: '2x', label: 'Double (2x)' },
  { id: 'custom', label: 'Custom width' },
];

export function SnapshotSettings() {
  const t = useT();
  const [settings, update] = usePersisted(SNAPSHOT);
  const resolutionId = useId();
  return (
    <section className="settings__section" aria-labelledby="settings-snapshot">
      <h3 id="settings-snapshot" className="settings__heading">
        {t('settings.snapshots')}
      </h3>
      <div className="settings__field">
        <label htmlFor={resolutionId}>Snapshot resolution</label>
        <select
          id={resolutionId}
          value={settings.resolution}
          onChange={(event) =>
            update((prev) => ({
              ...prev,
              resolution: event.target.value as SnapshotResolution,
            }))
          }
        >
          {RESOLUTIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="settings__hint">
          Sizes above {MAX_SIDE} pixels on a side or 30 megapixels are refused.
        </span>
      </div>
      {settings.resolution === 'custom' ? (
        <div className="settings__field">
          <label>
            Custom width (pixels)
            <NumberField
              key={settings.customWidth}
              min={MIN_CUSTOM_WIDTH}
              max={MAX_SIDE}
              value={settings.customWidth}
              onCommit={(customWidth) =>
                update((prev) => ({ ...prev, customWidth }))
              }
            />
          </label>
        </div>
      ) : null}
      <SwitchRow
        label="Caption on snapshots"
        description="Adds the model name, version and date along the bottom edge."
        checked={settings.overlay}
        onChange={() => update((prev) => ({ ...prev, overlay: !prev.overlay }))}
      />
      <div className="settings__field">
        <label>
          Present: advance every (seconds)
          <NumberField
            key={settings.advanceSeconds}
            min={0}
            max={MAX_ADVANCE_SECONDS}
            value={settings.advanceSeconds}
            onCommit={(advanceSeconds) =>
              update((prev) => ({ ...prev, advanceSeconds }))
            }
          />
        </label>
        <span className="settings__hint">
          0 keeps each viewpoint until you press a key.
        </span>
      </div>
    </section>
  );
}
