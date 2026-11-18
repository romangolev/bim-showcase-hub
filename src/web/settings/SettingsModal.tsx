import { useId } from 'react';
import { SwitchRow } from '../components/SwitchRow.js';
import type { ModalDefinition } from '../modal/types.js';
import { useTheme } from '../theme/ThemeContext.js';
import { useSettings } from './SettingsContext.js';
import { SettingsEntries } from './SettingsEntries.js';
import { DENSITIES, LANGUAGES, type Settings, TEXT_SIZES } from './settings.js';

const DENSITY_LABELS: Record<Settings['density'], string> = {
  comfortable: 'Comfortable',
  compact: 'Compact',
};

const TEXT_SIZE_LABELS: Record<Settings['textSize'], string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

const LANGUAGE_LABELS: Record<Settings['language'], string> = {
  en: 'English',
};

export function SettingsBody() {
  const { theme, toggleTheme } = useTheme();
  const { settings, setSetting } = useSettings();
  const warnId = useId();
  const recentsId = useId();
  const densityId = useId();
  const textSizeId = useId();
  const motionId = useId();
  const languageId = useId();
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
        <div className="settings__field">
          <label htmlFor={densityId}>Interface density</label>
          <select
            id={densityId}
            value={settings.density}
            onChange={(event) =>
              setSetting('density', event.target.value as Settings['density'])
            }
          >
            {DENSITIES.map((density) => (
              <option key={density} value={density}>
                {DENSITY_LABELS[density]}
              </option>
            ))}
          </select>
          <span className="settings__hint">
            Compact fits more rows and tighter gutters.
          </span>
        </div>
        <div className="settings__field">
          <label htmlFor={textSizeId}>Text size</label>
          <select
            id={textSizeId}
            value={settings.textSize}
            onChange={(event) =>
              setSetting('textSize', event.target.value as Settings['textSize'])
            }
          >
            {TEXT_SIZES.map((size) => (
              <option key={size} value={size}>
                {TEXT_SIZE_LABELS[size]}
              </option>
            ))}
          </select>
        </div>
        <div className="settings__field">
          <label htmlFor={motionId} className="settings__check">
            <input
              id={motionId}
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) =>
                setSetting('reducedMotion', event.target.checked)
              }
            />
            Reduce motion
          </label>
          <span className="settings__hint">
            Stops decorative animation on top of your system setting.
          </span>
        </div>
        <div className="settings__field">
          <label htmlFor={languageId}>Language</label>
          <select
            id={languageId}
            value={settings.language}
            onChange={(event) =>
              setSetting('language', event.target.value as Settings['language'])
            }
          >
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {LANGUAGE_LABELS[language]}
              </option>
            ))}
          </select>
        </div>
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
