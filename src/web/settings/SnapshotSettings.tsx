import { SettingsField } from '../components/SettingsForm.js';
import { SwitchRow } from '../components/SwitchRow.js';
import { useT } from '../i18n/i18n.js';
import { usePersisted } from '../storage.js';
import { NumberField } from '../ui/NumberField.js';
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
  return (
    <section className="settings__section" aria-labelledby="settings-snapshot">
      <h3 id="settings-snapshot" className="settings__heading">
        {t('settings.snapshots')}
      </h3>
      <SettingsField
        label="Snapshot resolution"
        hint={`Sizes above ${MAX_SIDE} pixels on a side or 30 megapixels are refused.`}
      >
        {(id) => (
          <select
            id={id}
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
        )}
      </SettingsField>
      {settings.resolution === 'custom' ? (
        <SettingsField label="Custom width (pixels)">
          {(id) => (
            <NumberField
              id={id}
              key={settings.customWidth}
              min={MIN_CUSTOM_WIDTH}
              max={MAX_SIDE}
              value={settings.customWidth}
              onValueCommitted={(customWidth) =>
                update((prev) => ({ ...prev, customWidth }))
              }
            />
          )}
        </SettingsField>
      ) : null}
      <SwitchRow
        label="Caption on snapshots"
        description="Adds the model name, version and date along the bottom edge."
        checked={settings.overlay}
        onChange={() => update((prev) => ({ ...prev, overlay: !prev.overlay }))}
      />
      <SettingsField
        label="Present: advance every (seconds)"
        hint="0 keeps each viewpoint until you press a key."
      >
        {(id) => (
          <NumberField
            id={id}
            key={settings.advanceSeconds}
            min={0}
            max={MAX_ADVANCE_SECONDS}
            value={settings.advanceSeconds}
            onValueCommitted={(advanceSeconds) =>
              update((prev) => ({ ...prev, advanceSeconds }))
            }
          />
        )}
      </SettingsField>
    </section>
  );
}
