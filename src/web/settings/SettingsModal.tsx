import { LAST_SESSION } from '../api/openModels.js';
import { ShortcutEditor } from '../commands/ShortcutEditor.js';
import type { BreadcrumbMode } from '../components/breadcrumb.js';
import { SettingsField } from '../components/SettingsForm.js';
import { SwitchRow } from '../components/SwitchRow.js';
import { TOPBAR_PREFS } from '../components/topbarPrefs.js';
import type { MessageId } from '../i18n/en.js';
import { translateNow, useT } from '../i18n/i18n.js';
import type { ModalDefinition } from '../modal/types.js';
import { usePersisted } from '../storage.js';
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

const DENSITY_LABELS: Record<Settings['density'], MessageId> = {
  comfortable: 'settings.densityComfortable',
  compact: 'settings.densityCompact',
};

const TEXT_SIZE_LABELS: Record<Settings['textSize'], string> = {
  100: '100%',
  112: '112%',
  125: '125%',
};

const THEME_LABELS: Record<ThemePreference, MessageId> = {
  system: 'settings.themeSystem',
  light: 'settings.themeLight',
  dark: 'settings.themeDark',
};

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ru: 'Русский',
};

const UNITS_LABELS: Record<Units, MessageId> = {
  metric: 'settings.unitsMetric',
  imperial: 'settings.unitsImperial',
};

const BREADCRUMB_LABELS: Record<BreadcrumbMode, MessageId> = {
  full: 'settings.breadcrumbFull',
  file: 'settings.breadcrumbFile',
  off: 'settings.breadcrumbOff',
};

const BREADCRUMB_MODES: readonly BreadcrumbMode[] = ['full', 'file', 'off'];

export function SettingsBody() {
  const { settings, setSetting } = useSettings();
  const [topbar, setTopbar] = usePersisted(TOPBAR_PREFS);
  const t = useT();
  return (
    <div className="settings">
      <section
        className="settings__section"
        aria-labelledby="settings-appearance"
      >
        <h3 id="settings-appearance" className="settings__heading">
          {t('settings.appearance')}
        </h3>
        <SettingsField
          label={t('settings.theme')}
          hint={t('settings.themeHint')}
        >
          {(id) => (
            <>
              <select
                id={id}
                value={settings.theme}
                onChange={(event) =>
                  setSetting('theme', event.target.value as Settings['theme'])
                }
              >
                {THEME_PREFERENCES.map((theme) => (
                  <option key={theme} value={theme}>
                    {t(THEME_LABELS[theme])}
                  </option>
                ))}
              </select>
            </>
          )}
        </SettingsField>
        <SettingsField
          label={t('settings.topBar')}
          hint={t('settings.topBarHint')}
        >
          {(id) => (
            <>
              <select
                id={id}
                value={topbar.breadcrumb}
                onChange={(event) =>
                  setTopbar({
                    breadcrumb: event.target.value as BreadcrumbMode,
                  })
                }
              >
                {BREADCRUMB_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(BREADCRUMB_LABELS[mode])}
                  </option>
                ))}
              </select>
            </>
          )}
        </SettingsField>
        <SettingsField
          label={t('settings.density')}
          hint={t('settings.densityHint')}
        >
          {(id) => (
            <>
              <select
                id={id}
                value={settings.density}
                onChange={(event) =>
                  setSetting(
                    'density',
                    event.target.value as Settings['density'],
                  )
                }
              >
                {DENSITIES.map((density) => (
                  <option key={density} value={density}>
                    {t(DENSITY_LABELS[density])}
                  </option>
                ))}
              </select>
            </>
          )}
        </SettingsField>
        <SettingsField
          label={t('settings.textSize')}
          hint={t('settings.textSizeHint')}
        >
          {(id) => (
            <>
              <select
                id={id}
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
            </>
          )}
        </SettingsField>
        <SwitchRow
          label={t('settings.reduceMotion')}
          description={t('settings.reduceMotionHint')}
          checked={settings.reducedMotion}
          onChange={() => setSetting('reducedMotion', !settings.reducedMotion)}
        />
      </section>
      <ShortcutEditor />
      <section className="settings__section" aria-labelledby="settings-region">
        <h3 id="settings-region" className="settings__heading">
          {t('settings.languageUnits')}
        </h3>
        <SettingsField
          label={t('settings.language')}
          hint={t('settings.languageHint')}
        >
          {(id) => (
            <>
              <select
                id={id}
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
            </>
          )}
        </SettingsField>
        <SettingsField
          label={t('settings.units')}
          hint={t('settings.unitsHint')}
        >
          {(id) => (
            <>
              <select
                id={id}
                value={settings.units}
                onChange={(event) =>
                  setSetting('units', event.target.value as Units)
                }
              >
                {UNITS.map((units) => (
                  <option key={units} value={units}>
                    {t(UNITS_LABELS[units])}
                  </option>
                ))}
              </select>
            </>
          )}
        </SettingsField>
      </section>
      <section className="settings__section" aria-labelledby="settings-session">
        <h3 id="settings-session" className="settings__heading">
          {t('settings.session')}
        </h3>
        <SettingsField
          label={t('settings.warnBeforeEnd')}
          hint={t('settings.warnBeforeEndHint')}
        >
          {(id) => (
            <>
              <input
                id={id}
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
            </>
          )}
        </SettingsField>
        <SwitchRow
          label="Reopen my tabs after the browser restarts"
          description="Restores the tabs from your last visit. Their view state is not kept."
          checked={settings.restoreSession}
          onChange={() => {
            setSetting('restoreSession', !settings.restoreSession);
            if (settings.restoreSession) LAST_SESSION.remove();
          }}
        />
      </section>
      <section
        className="settings__section"
        aria-labelledby="settings-documents"
      >
        <h3 id="settings-documents" className="settings__heading">
          {t('settings.documents')}
        </h3>
        <SettingsField
          label={t('settings.recentsLength')}
          hint={t('settings.recentsLengthHint')}
        >
          {(id) => (
            <>
              <input
                id={id}
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
            </>
          )}
        </SettingsField>
      </section>
      <SettingsEntries />
      <DefaultsSettings />
      <LocalDataSettings />
    </div>
  );
}

export const SETTINGS_MODAL: ModalDefinition = {
  id: 'settings',
  get title() {
    return translateNow('settings.title');
  },
  size: 'lg',
  Body: SettingsBody,
};
