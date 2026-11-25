import { LAST_SESSION } from '../api/openModels.js';
import { ShortcutEditor } from '../commands/ShortcutEditor.js';
import type { BreadcrumbMode } from '../components/breadcrumb.js';
import { SettingsField } from '../components/SettingsForm.js';
import { SwitchRow } from '../components/SwitchRow.js';
import { TOPBAR_PREFS } from '../components/topbarPrefs.js';
import type { MessageId } from '../i18n/en.js';
import { translateNow, useT } from '../i18n/i18n.js';
import { usePersisted } from '../storage.js';
import { NotificationSettingsSection } from '../tasks/NotificationSettingsSection.js';
import { THEME_PREFERENCES, type ThemePreference } from '../theme/theme.js';
import { NumberField } from '../ui/NumberField.js';
import { Select, SelectOption } from '../ui/Select.js';
import { ChartSettingsSection } from './ChartSettingsSection.js';
import { DefaultsSettings } from './DefaultsSettings.js';
import { LocalDataSettings } from './LocalDataSettings.js';
import { TreeSettingsForm } from './PaneSettingsForms.js';
import { SavedItemsSettings } from './SavedItemsSettings.js';
import { useSettings } from './SettingsContext.js';
import { SettingsEntries } from './SettingsEntries.js';
import { SnapshotSettings } from './SnapshotSettings.js';
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
import {
  registerSettingsSection,
  type SettingsSection,
} from './settingsSections.js';

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

function GeneralSection() {
  const { settings, setSetting } = useSettings();
  const t = useT();
  return (
    <>
      <section className="settings__section" aria-labelledby="settings-region">
        <h3 id="settings-region" className="settings__heading">
          {t('settings.languageUnits')}
        </h3>
        <SettingsField
          label={t('settings.language')}
          hint={t('settings.languageHint')}
        >
          {(id) => (
            <Select
              id={id}
              value={settings.language}
              onValueChange={(next) => setSetting('language', next as Language)}
            >
              {LANGUAGES.map((language) => (
                <SelectOption key={language} value={language}>
                  {LANGUAGE_LABELS[language]}
                </SelectOption>
              ))}
            </Select>
          )}
        </SettingsField>
        <SettingsField
          label={t('settings.units')}
          hint={t('settings.unitsHint')}
        >
          {(id) => (
            <Select
              id={id}
              value={settings.units}
              onValueChange={(next) => setSetting('units', next as Units)}
            >
              {UNITS.map((units) => (
                <SelectOption key={units} value={units}>
                  {t(UNITS_LABELS[units])}
                </SelectOption>
              ))}
            </Select>
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
            <NumberField
              id={id}
              min={0}
              max={120}
              value={settings.sessionWarnMinutes}
              onValueCommitted={(sessionWarnMinutes) =>
                setSetting('sessionWarnMinutes', sessionWarnMinutes)
              }
            />
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
      <DefaultsSettings />
    </>
  );
}

function AppearanceSection() {
  const { settings, setSetting } = useSettings();
  const [topbar, setTopbar] = usePersisted(TOPBAR_PREFS);
  const t = useT();
  return (
    <>
      <div className="settings__section">
        <SettingsField
          label={t('settings.theme')}
          hint={t('settings.themeHint')}
        >
          {(id) => (
            <Select
              id={id}
              value={settings.theme}
              onValueChange={(next) =>
                setSetting('theme', next as Settings['theme'])
              }
            >
              {THEME_PREFERENCES.map((theme) => (
                <SelectOption key={theme} value={theme}>
                  {t(THEME_LABELS[theme])}
                </SelectOption>
              ))}
            </Select>
          )}
        </SettingsField>
        <SettingsField
          label={t('settings.topBar')}
          hint={t('settings.topBarHint')}
        >
          {(id) => (
            <Select
              id={id}
              value={topbar.breadcrumb}
              onValueChange={(next) =>
                setTopbar({
                  breadcrumb: next as BreadcrumbMode,
                })
              }
            >
              {BREADCRUMB_MODES.map((mode) => (
                <SelectOption key={mode} value={mode}>
                  {t(BREADCRUMB_LABELS[mode])}
                </SelectOption>
              ))}
            </Select>
          )}
        </SettingsField>
        <SettingsField
          label={t('settings.density')}
          hint={t('settings.densityHint')}
        >
          {(id) => (
            <Select
              id={id}
              value={settings.density}
              onValueChange={(next) =>
                setSetting('density', next as Settings['density'])
              }
            >
              {DENSITIES.map((density) => (
                <SelectOption key={density} value={density}>
                  {t(DENSITY_LABELS[density])}
                </SelectOption>
              ))}
            </Select>
          )}
        </SettingsField>
        <SettingsField
          label={t('settings.textSize')}
          hint={t('settings.textSizeHint')}
        >
          {(id) => (
            <Select
              id={id}
              value={settings.textSize}
              onValueChange={(next) =>
                setSetting('textSize', Number(next) as TextSize)
              }
            >
              {TEXT_SIZES.map((size) => (
                <SelectOption key={size} value={size}>
                  {TEXT_SIZE_LABELS[size]}
                </SelectOption>
              ))}
            </Select>
          )}
        </SettingsField>
        <SwitchRow
          label={t('settings.reduceMotion')}
          description={t('settings.reduceMotionHint')}
          checked={settings.reducedMotion}
          onChange={() => setSetting('reducedMotion', !settings.reducedMotion)}
        />
      </div>
      <ChartSettingsSection />
    </>
  );
}

function DocumentsSection() {
  const { settings, setSetting } = useSettings();
  const t = useT();
  return (
    <>
      <div className="settings__section">
        <SettingsField
          label={t('settings.recentsLength')}
          hint={t('settings.recentsLengthHint')}
        >
          {(id) => (
            <NumberField
              id={id}
              min={0}
              max={20}
              value={settings.recentsLength}
              onValueCommitted={(recentsLength) =>
                setSetting('recentsLength', recentsLength)
              }
            />
          )}
        </SettingsField>
      </div>
      <TreeSettingsForm heading={false} />
    </>
  );
}

function ToolsSection() {
  return (
    <>
      <SettingsEntries />
      <SnapshotSettings />
    </>
  );
}

function DataSection() {
  return (
    <>
      <SavedItemsSettings />
      <LocalDataSettings />
    </>
  );
}

const SECTIONS: readonly SettingsSection[] = [
  {
    id: 'general',
    label: () => translateNow('settings.general'),
    icon: 'settings',
    Body: GeneralSection,
    keywords: 'language units session defaults reset hints',
  },
  {
    id: 'appearance',
    label: () => translateNow('settings.appearance'),
    icon: 'palette',
    Body: AppearanceSection,
    keywords: 'theme density text size motion top bar charts palette',
  },
  {
    id: 'documents',
    label: () => translateNow('settings.documents'),
    icon: 'folder',
    Body: DocumentsSection,
    keywords: 'tree recent models sort thumbnails open',
  },
  {
    id: 'tools',
    label: () => translateNow('settings.toolsPanes'),
    icon: 'wrench',
    Body: ToolsSection,
    keywords: 'paint export summary dashboard snapshots presentation',
  },
  {
    id: 'shortcuts',
    label: () => translateNow('settings.shortcuts'),
    icon: 'keyboard',
    Body: ShortcutEditor,
    keywords: 'keyboard keys',
  },
  {
    id: 'notifications',
    label: () => translateNow('settings.notifications'),
    icon: 'bell',
    Body: NotificationSettingsSection,
    keywords: 'toasts quiet',
  },
  {
    id: 'data',
    label: () => translateNow('settings.data'),
    icon: 'database',
    Body: DataSection,
    keywords: 'saved items import export local data storage clear privacy',
  },
];

for (const section of SECTIONS) registerSettingsSection(section);
