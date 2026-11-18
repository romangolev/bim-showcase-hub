import { NumberField } from '../components/NumberField.js';
import { SwitchRow } from '../components/SwitchRow.js';
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
    <section
      className="settings__section"
      aria-labelledby="settings-notifications"
    >
      <h3 id="settings-notifications" className="settings__heading">
        Notifications
      </h3>
      <div className="settings__field">
        <label>
          Toast position
          <select
            value={settings.position}
            onChange={(event) =>
              update((prev) => ({
                ...prev,
                position: event.target.value as ToastPosition,
              }))
            }
          >
            {TOAST_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {POSITION_LABELS[position]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="settings__field">
        <label>
          Toast duration (seconds)
          <NumberField
            key={settings.durationMs}
            min={0}
            max={60}
            value={Math.round(settings.durationMs / 1000)}
            onCommit={(seconds) =>
              update((prev) => ({ ...prev, durationMs: seconds * 1000 }))
            }
          />
        </label>
        <span className="settings__hint">
          0 keeps a toast until you dismiss it. Errors stay until dismissed.
        </span>
      </div>
      <SwitchRow
        label="Quiet mode"
        description="Hides toasts. Outcomes are still announced to screen readers."
        checked={settings.quiet}
        onChange={() => update((prev) => ({ ...prev, quiet: !prev.quiet }))}
      />
    </section>
  );
}
