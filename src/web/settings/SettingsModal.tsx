import { useId } from 'react';
import { LAST_SESSION } from '../api/openModels.js';
import { ShortcutEditor } from '../commands/ShortcutEditor.js';
import type { BreadcrumbMode } from '../components/breadcrumb.js';
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
  const themeId = useId();
  const warnId = useId();
  const recentsId = useId();
  const densityId = useId();
  const textSizeId = useId();
  const motionId = useId();
  const languageId = useId();
  const unitsId = useId();
  const restoreId = useId();
  const breadcrumbId = useId();
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
        <div className="settings__field">
          <label htmlFor={themeId}>{t('settings.theme')}</label>
          <select
            id={themeId}
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
          <span className="settings__hint">{t('settings.themeHint')}</span>
        </div>
        <div className="settings__field">
          <label htmlFor={breadcrumbId}>{t('settings.topBar')}</label>
          <select
            id={breadcrumbId}
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
          <span className="settings__hint">{t('settings.topBarHint')}</span>
        </div>
        <div className="settings__field">
          <label htmlFor={densityId}>{t('settings.density')}</label>
          <select
            id={densityId}
            value={settings.density}
            onChange={(event) =>
              setSetting('density', event.target.value as Settings['density'])
            }
          >
            {DENSITIES.map((density) => (
              <option key={density} value={density}>
                {t(DENSITY_LABELS[density])}
              </option>
            ))}
          </select>
          <span className="settings__hint">{t('settings.densityHint')}</span>
        </div>
        <div className="settings__field">
          <label htmlFor={textSizeId}>{t('settings.textSize')}</label>
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
          <span className="settings__hint">{t('settings.textSizeHint')}</span>
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
            {t('settings.reduceMotion')}
          </label>
          <span className="settings__hint">
            {t('settings.reduceMotionHint')}
          </span>
        </div>
      </section>
      <ShortcutEditor />
      <section className="settings__section" aria-labelledby="settings-region">
        <h3 id="settings-region" className="settings__heading">
          {t('settings.languageUnits')}
        </h3>
        <div className="settings__field">
          <label htmlFor={languageId}>{t('settings.language')}</label>
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
          <span className="settings__hint">{t('settings.languageHint')}</span>
        </div>
        <div className="settings__field">
          <label htmlFor={unitsId}>{t('settings.units')}</label>
          <select
            id={unitsId}
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
          <span className="settings__hint">{t('settings.unitsHint')}</span>
        </div>
      </section>
      <section className="settings__section" aria-labelledby="settings-session">
        <h3 id="settings-session" className="settings__heading">
          {t('settings.session')}
        </h3>
        <div className="settings__field">
          <label htmlFor={warnId}>{t('settings.warnBeforeEnd')}</label>
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
          <span className="settings__hint">
            {t('settings.warnBeforeEndHint')}
          </span>
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
          {t('settings.documents')}
        </h3>
        <div className="settings__field">
          <label htmlFor={recentsId}>{t('settings.recentsLength')}</label>
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
            {t('settings.recentsLengthHint')}
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
  get title() {
    return translateNow('settings.title');
  },
  size: 'lg',
  Body: SettingsBody,
};
