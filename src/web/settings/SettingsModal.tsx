import { useId } from 'react';
import { SwitchRow } from '../components/SwitchRow.js';
import type { ModalDefinition } from '../modal/types.js';
import { useTheme } from '../theme/ThemeContext.js';
import { useSettings } from './SettingsContext.js';
import { SettingsEntries } from './SettingsEntries.js';

export function SettingsBody() {
  const { theme, toggleTheme } = useTheme();
  const { settings, setSetting } = useSettings();
  const warnId = useId();
  const recentsId = useId();
  return (
    <div className="settings">
      <section
        className="settings__section"
        aria-labelledby="settings-appearance"
      >
        <h3 id="settings-appearance" className="settings__heading">
          Appearance
        </h3>
        <SwitchRow
          label="Dark theme"
          checked={theme === 'dark'}
          onChange={toggleTheme}
        />
      </section>
      <section className="settings__section" aria-labelledby="settings-session">
        <h3 id="settings-session" className="settings__heading">
          Session
        </h3>
        <div className="settings__field">
          <label htmlFor={warnId}>
            Warn me before the session ends (minutes)
          </label>
          <input
            id={warnId}
            type="number"
            min={0}
            max={120}
            value={settings.sessionWarnMinutes}
            onChange={(event) =>
              setSetting(
                'sessionWarnMinutes',
                Math.min(120, Math.max(0, Number(event.target.value) || 0)),
              )
            }
          />
          <span className="settings__hint">0 turns the notice off.</span>
        </div>
      </section>
      <section
        className="settings__section"
        aria-labelledby="settings-documents"
      >
        <h3 id="settings-documents" className="settings__heading">
          Documents
        </h3>
        <div className="settings__field">
          <label htmlFor={recentsId}>Recent models to list</label>
          <input
            id={recentsId}
            type="number"
            min={0}
            max={20}
            value={settings.recentsLength}
            onChange={(event) =>
              setSetting(
                'recentsLength',
                Math.min(
                  20,
                  Math.max(0, Math.round(Number(event.target.value) || 0)),
                ),
              )
            }
          />
          <span className="settings__hint">
            Pinned models are always listed. 0 hides the recent list.
          </span>
        </div>
      </section>
      <SettingsEntries />
    </div>
  );
}

export const SETTINGS_MODAL: ModalDefinition = {
  id: 'settings',
  title: 'Settings',
  size: 'lg',
  Body: SettingsBody,
};
