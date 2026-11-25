import { SettingsField } from '../components/SettingsForm.js';
import { SwitchRow } from '../components/SwitchRow.js';
import { NumberField } from '../ui/NumberField.js';
import { Select, SelectOption } from '../ui/Select.js';
import {
  TOAST_POSITIONS,
  type ToastPosition,
  useNotificationSettings,
} from './notificationSettings.js';

const POSITION_LABELS: Record<ToastPosition, string> = {
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
  'top-right': 'Top right',
  'top-left': 'Top left',
};

export function NotificationSettingsSection() {
  const [settings, update] = useNotificationSettings();
  return (
    <div className="settings__section">
      <SettingsField label="Toast position">
        {(id) => (
          <Select
            id={id}
            value={settings.position}
            onValueChange={(next) =>
              update((prev) => ({
                ...prev,
                position: next as ToastPosition,
              }))
            }
          >
            {TOAST_POSITIONS.map((position) => (
              <SelectOption key={position} value={position}>
                {POSITION_LABELS[position]}
              </SelectOption>
            ))}
          </Select>
        )}
      </SettingsField>
      <SettingsField
        label="Toast duration (seconds)"
        hint="0 keeps a toast until you dismiss it. Errors stay until dismissed."
      >
        {(id) => (
          <NumberField
            id={id}
            key={settings.durationMs}
            min={0}
            max={60}
            value={Math.round(settings.durationMs / 1000)}
            onValueCommitted={(seconds) =>
              update((prev) => ({ ...prev, durationMs: seconds * 1000 }))
            }
          />
        )}
      </SettingsField>
      <SwitchRow
        label="Quiet mode"
        description="Hides toasts. Outcomes are still announced to screen readers."
        checked={settings.quiet}
        onChange={() => update((prev) => ({ ...prev, quiet: !prev.quiet }))}
      />
    </div>
  );
}
