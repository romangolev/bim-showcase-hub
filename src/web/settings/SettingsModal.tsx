import { useId } from 'react';
import type { ModalDefinition } from '../modal/types.js';
import { SummarySettingsBody } from '../panels/SummarySettings.js';
import { useTheme } from '../theme/ThemeContext.js';
import { ExcelSettingsSection } from './ExcelSettingsSection.js';
import { IfcSettingsSection } from './IfcSettingsSection.js';
import { PaintSettingsSection } from './PaintSettingsSection.js';
import { useSettings } from './SettingsContext.js';

interface ExperimentalFeature {
  key: 'paintBrushes' | 'excelExport' | 'glbExport' | 'ifcExport';
  label: string;
  description: string;
}

export const EXPERIMENTAL_FEATURES: readonly ExperimentalFeature[] = [
  {
    key: 'paintBrushes',
    label: 'Paint brushes',
    description: 'Colour the selected elements from the viewer toolbar.',
  },
  {
    key: 'excelExport',
    label: 'Excel export',
    description:
      'Export element properties to an .xlsx file from the viewer toolbar.',
  },
  {
    key: 'glbExport',
    label: 'Geometry export',
    description:
      'Export the model geometry to a .glb file from the viewer toolbar.',
  },
  {
    key: 'ifcExport',
    label: 'IFC export',
    description:
      'Export the model to an .ifc file from the viewer toolbar, using the IFC export settings below.',
  },
];

interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
}

function SwitchRow({ label, description, checked, onChange }: SwitchRowProps) {
  const hintId = useId();
  return (
    <label className="switch-row">
      <span className="switch-row__text">
        <span className="switch-row__label">{label}</span>
        {description ? (
          <span id={hintId} className="switch-row__hint">
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        aria-label={label}
        aria-describedby={description ? hintId : undefined}
        onChange={onChange}
      />
    </label>
  );
}

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
      <section
        className="settings__section"
        aria-labelledby="settings-experimental"
      >
        <h3 id="settings-experimental" className="settings__heading">
          Experimental features
        </h3>
        {EXPERIMENTAL_FEATURES.map((feature) => (
          <SwitchRow
            key={feature.key}
            label={feature.label}
            description={feature.description}
            checked={settings[feature.key]}
            onChange={() => setSetting(feature.key, !settings[feature.key])}
          />
        ))}
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
      <section className="settings__section" aria-labelledby="settings-summary">
        <h3 id="settings-summary" className="settings__heading">
          Model summary
        </h3>
        <SummarySettingsBody />
      </section>
      <PaintSettingsSection />
      <ExcelSettingsSection />
      <IfcSettingsSection />
    </div>
  );
}

export const SETTINGS_MODAL: ModalDefinition = {
  id: 'settings',
  title: 'Settings',
  size: 'lg',
  Body: SettingsBody,
};
