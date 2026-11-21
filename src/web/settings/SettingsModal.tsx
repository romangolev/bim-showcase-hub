import { useId } from 'react';
import { LAST_SESSION } from '../api/openModels.js';
import { ShortcutEditor } from '../commands/ShortcutEditor.js';
import type { ModalDefinition } from '../modal/types.js';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme.js';
import { DefaultsSettings } from './DefaultsSettings.js';
import { LocalDataSettings } from './LocalDataSettings.js';
import { useSettings } from './SettingsContext.js';
import { SettingsEntries } from './SettingsEntries.js';
import {
  DENSITIES,
  LANGUAGES,
  type Language,
  type Settings,
  TEXT_SIZES,
  type TextSize,
  UNITS,
  type Units,
} from './settings.js';

const DENSITY_LABELS: Record<Settings['density'], string> = {
  comfortable: 'Comfortable',
  compact: 'Compact',
};

const TEXT_SIZE_LABELS: Record<Settings['textSize'], string> = {
  100: '100%',
  112: '112%',
  125: '125%',
};

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ru: 'Русский',
};

const UNITS_LABELS: Record<Units, string> = {
  metric: 'Metric',
  imperial: 'Imperial',
};

export function SettingsBody() {
  const { settings, setSetting } = useSettings();
  const themeId = useId();
  const warnId = useId();
  const recentsId = useId();
  const densityId = useId();
  const textSizeId = useId();
  const motionId = useId();
  const languageId = useId();
  const unitsId = useId();
  const restoreId = useId();
  return (
    <div className="settings">
      <section
        className="settings__section"
        aria-labelledby="settings-appearance"
      >
        <h3 id="settings-appearance" className="settings__heading">
          Appearance
        </h3>
        <div className="settings__field">
          <label htmlFor={themeId}>Theme</label>
          <select
            id={themeId}
            value={settings.theme}
            onChange={(event) =>
              setSetting('theme', event.target.value as Settings['theme'])
            }
          >
            {THEME_PREFERENCES.map((theme) => (
              <option key={theme} value={theme}>
                {THEME_LABELS[theme]}
              </option>
            ))}
          </select>
          <span className="settings__hint">
            System follows your device appearance.
          </span>
        </div>
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
            Compact tightens gutters, rows, controls and dock tabs.
          </span>
        </div>
        <div className="settings__field">
          <label htmlFor={textSizeId}>Text size</label>
          <select
            id={textSizeId}
            value={settings.textSize}
            onChange={(event) =>
              setSetting('textSize', Number(event.target.value) as TextSize)
            }
          >
            {TEXT_SIZES.map((size) => (
              <option key={size} value={size}>
                {TEXT_SIZE_LABELS[size]}
              </option>
            ))}
          </select>
          <span className="settings__hint">
            Scales text and the spacing that follows it.
          </span>
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
            Stops animation in this app even when your device does not ask for
            it.
          </span>
        </div>
      </section>
      <ShortcutEditor />
      <section className="settings__section" aria-labelledby="settings-region">
        <h3 id="settings-region" className="settings__heading">
          Language and units
        </h3>
        <div className="settings__field">
          <label htmlFor={languageId}>Language</label>
          <select
            id={languageId}
            value={settings.language}
            onChange={(event) =>
              setSetting('language', event.target.value as Language)
            }
          >
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {LANGUAGE_LABELS[language]}
              </option>
            ))}
          </select>
          <span className="settings__hint">
            Saved with your settings. The interface stays in English for now.
          </span>
        </div>
        <div className="settings__field">
          <label htmlFor={unitsId}>Units</label>
          <select
            id={unitsId}
            value={settings.units}
            onChange={(event) =>
              setSetting('units', event.target.value as Units)
            }
          >
            {UNITS.map((units) => (
              <option key={units} value={units}>
                {UNITS_LABELS[units]}
              </option>
            ))}
          </select>
          <span className="settings__hint">
            Saved with your settings. Property values keep the model's own
            units.
          </span>
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
        <div className="settings__field">
          <label htmlFor={restoreId} className="settings__check">
            <input
              id={restoreId}
              type="checkbox"
              checked={settings.restoreSession}
              onChange={(event) => {
                setSetting('restoreSession', event.target.checked);
                if (!event.target.checked) LAST_SESSION.remove();
              }}
            />
            Reopen my tabs after the browser restarts
          </label>
          <span className="settings__hint">
            Restores the tabs from your last visit. Their view state is not
            kept.
          </span>
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
      <DefaultsSettings />
      <LocalDataSettings />
    </div>
  );
}

export const SETTINGS_MODAL: ModalDefinition = {
  id: 'settings',
  title: 'Settings',
  size: 'lg',
  Body: SettingsBody,
};
